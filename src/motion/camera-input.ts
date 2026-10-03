import type { InputSource, Unsubscribe } from '../contracts/input'
import { InputEmitter } from '../shared/emitter'
import type { MicAccess } from '../shared/microphone'
import {
  CALIBRATION_PROMPTS,
  calibrationProgress,
  median,
  startCalibration,
  stepCalibration,
  type CalibrationResult,
  type CalibrationState,
  type CalibrationStep,
} from './calibration'
import { closeCamera, openCamera, type CameraSize } from './camera'
import { DEFAULT_THRESHOLDS } from './hand-state'
import { GestureClassifier } from '../gestures/model'
import { GESTURE_MODEL_PATH } from './constants'
import { LoadMeter, type LoadProgress } from './loading'
import { assignHandIds, type RawHand } from './landmarks'
import {
  initialPipeline,
  processFrame,
  withPointerBox,
  withThresholds,
  type HandDebug,
  type OutEvent,
  type PipelineState,
} from './pipeline'
import { boxAround, type PointerBox } from './pointer'
import { initialStats, stepStats, type FrameStats } from './stats'
import { HandTracker, runVideoLoop, type Delegate, type TrackerOptions } from './tracker'
import type { Thresholds, Vec2 } from './types'

/** Источник ввода с веб-камеры. Реализует контракт InputSource, плюс отладка и калибровка для демо и S4. */

export interface CameraInputOptions extends TrackerOptions {
  /** Видео для показа пользователю. Если не передано, создаётся скрытое. */
  readonly video?: HTMLVideoElement
  /** Пороги после прошлой калибровки. */
  readonly thresholds?: Thresholds
  /** Рабочая зона курсора после прошлой калибровки. */
  readonly pointerBox?: PointerBox
  /** Доля загруженного до первого кадра: около 22 МБ моделей и wasm. */
  readonly onLoadProgress?: (p: LoadProgress) => void
  /** Запрашиваемый размер кадра. Размер — главная статья расходов распознавания. */
  readonly cameraSize?: CameraSize
  /** Спросить микрофон вместе с камерой одним окном браузера: нужно голосовому вводу. */
  readonly withMic?: boolean
  /** Ответ про микрофон, если он запрашивался. Приходит, как только камера открылась. */
  readonly onMicAccess?: (access: MicAccess) => void
}

export interface FrameInfo {
  readonly t: number
  readonly raw: readonly RawHand[]
  readonly hands: readonly HandDebug[]
  readonly thresholds: Thresholds
  readonly stats: FrameStats
  readonly delegate: Delegate
}

export interface CalibrationProgress {
  readonly step: CalibrationStep
  readonly prompt: string
  /** Прогресс текущего шага 0..1. */
  readonly progress: number
  readonly error: string | undefined
}

type Listener<T> = (v: T) => void

interface CalibrationJob {
  state: CalibrationState | undefined
  /** Центры ладони на шаге «открытая ладонь»: по ним ставится рабочая зона курсора. */
  readonly centers: Vec2[]
  readonly onProgress: Listener<CalibrationProgress> | undefined
  readonly resolve: (r: CalibrationResult) => void
  readonly reject: (e: Error) => void
}

export class CameraInput implements InputSource {
  private readonly em = new InputEmitter()
  private readonly frameListeners = new Set<Listener<FrameInfo>>()
  private readonly videoEl: HTMLVideoElement
  private pipeline: PipelineState
  private stats = initialStats()
  private tracker: HandTracker | undefined
  /** Обученный классификатор позы. Если не загрузился, работают правила по углам пальцев. */
  private classifier: GestureClassifier | undefined
  private mediaStream: MediaStream | undefined
  private stopLoop: (() => void) | undefined
  private calibration: CalibrationJob | undefined

  constructor(private readonly opts: CameraInputOptions = {}) {
    this.videoEl = opts.video ?? document.createElement('video')
    this.pipeline = initialPipeline(opts.thresholds ?? DEFAULT_THRESHOLDS, opts.pointerBox)
  }

  on: InputSource['on'] = (type, fn) => this.em.on(type, fn)

  /** Включает камеру и модель. Бросает CameraError или TrackerLoadError с текстом для пользователя. */
  async start(): Promise<void> {
    if (this.stopLoop) return
    // Один счётчик на все три файла: они качаются параллельно, а доля наверх уходит одна.
    const meter = new LoadMeter(this.opts.onLoadProgress)
    const model = GestureClassifier.load(GESTURE_MODEL_PATH, (url) => meter.fetch('gestures', url)).catch(() => undefined)
    const [stream, tracker, classifier] = await Promise.all([
      openCamera(this.videoEl, this.opts.cameraSize, this.opts.withMic).then((got) => {
        if (got.mic) this.opts.onMicAccess?.(got.mic)
        return got.stream
      }),
      HandTracker.create({ ...this.opts, meter }),
      model,
    ]).catch((err: unknown) => {
      this.stop()
      throw err
    })
    this.mediaStream = stream
    this.tracker = tracker
    this.classifier = classifier
    this.stopLoop = runVideoLoop(this.videoEl, (t) => this.onVideoFrame(t))
  }

  stop(): void {
    this.stopLoop?.()
    this.stopLoop = undefined
    this.tracker?.close()
    this.tracker = undefined
    closeCamera(this.mediaStream, this.videoEl)
    this.mediaStream = undefined
    this.calibration?.reject(new Error('Калибровка прервана, запусти её снова'))
    this.calibration = undefined
  }

  get video(): HTMLVideoElement {
    return this.videoEl
  }

  get stream(): MediaStream | undefined {
    return this.mediaStream
  }

  get thresholds(): Thresholds {
    return this.pipeline.thresholds
  }

  setThresholds(th: Thresholds): void {
    this.pipeline = withThresholds(this.pipeline, th)
  }

  get pointerBox(): PointerBox {
    return this.pipeline.box
  }

  /** Рабочая зона кадра, растягиваемая на экран. Калибровка ставит её вокруг удобного положения руки. */
  setPointerBox(box: PointerBox): void {
    this.pipeline = withPointerBox(this.pipeline, box)
  }

  /** Подписка на отладочные данные каждого кадра. */
  onFrame(fn: Listener<FrameInfo>): Unsubscribe {
    this.frameListeners.add(fn)
    return () => this.frameListeners.delete(fn)
  }

  /** Калибровка: «Покажи открытую ладонь», затем «Сожми кулак». При успехе пороги применяются сразу. */
  calibrate(onProgress?: Listener<CalibrationProgress>): Promise<CalibrationResult> {
    this.calibration?.reject(new Error('Калибровка запущена заново'))
    return new Promise((resolve, reject) => {
      this.calibration = { state: undefined, centers: [], onProgress, resolve, reject }
    })
  }

  private onVideoFrame(t: number): void {
    const tracker = this.tracker
    if (!tracker) return
    const started = performance.now()
    const raw = tracker.detect(this.videoEl, t)
    if (!raw) return
    const r = processFrame(this.pipeline, { t, hands: this.withPoses(raw) })
    this.pipeline = r.state
    r.events.forEach((ev) => this.dispatch(ev))
    this.stats = stepStats(this.stats, t, performance.now() - started)
    this.stepCalibrationJob(t, r.debug)
    const info: FrameInfo = { t, raw, hands: r.debug, thresholds: this.pipeline.thresholds, stats: this.stats, delegate: tracker.delegate }
    this.frameListeners.forEach((fn) => fn(info))
  }

  /** Руки кадра с позой от классификатора. Метка руки MediaPipe нужна признакам для зеркалирования. */
  private withPoses(raw: readonly RawHand[]): ReturnType<typeof assignHandIds> {
    const hands = assignHandIds(raw)
    const c = this.classifier
    if (!c) return hands
    return hands.map((h) => {
      const src = raw.find((r) => r.world === h.world)
      return { ...h, pose: c.classify(h.world, src?.label ?? 'Right') }
    })
  }

  private dispatch(ev: OutEvent): void {
    // Тип события и полезная нагрузка согласованы конструкцией OutEvent.
    this.em.emit(ev.type, ev.e as never)
  }

  private centerPointerBox(centers: readonly Vec2[]): void {
    if (centers.length === 0) return
    const center = { x: median(centers.map((c) => c.x)), y: median(centers.map((c) => c.y)) }
    this.setPointerBox(boxAround(center, this.pipeline.box))
  }

  private stepCalibrationJob(t: number, hands: readonly HandDebug[]): void {
    const job = this.calibration
    if (!job) return
    const hand = hands.find((h) => h.hand === 'right') ?? hands[0]
    // Геометрия, а не признаки для подсказок: калибровка ставит пороги и не может измерять
    // величину, которая сама из них выведена.
    const state = stepCalibration(job.state ?? startCalibration(t), t, hand?.geometry.closure)
    job.state = state
    if (state.step === 'open' && hand) job.centers.push(hand.geometry.center)
    const prompt = state.step === 'failed' ? (state.error ?? CALIBRATION_PROMPTS.failed) : CALIBRATION_PROMPTS[state.step]
    job.onProgress?.({ step: state.step, prompt, progress: calibrationProgress(state, t), error: state.error })
    if (state.step === 'done' && state.result) {
      this.setThresholds(state.result.thresholds)
      this.centerPointerBox(job.centers)
      this.calibration = undefined
      job.resolve(state.result)
    } else if (state.step === 'failed') {
      this.calibration = undefined
      job.reject(new Error(state.error ?? CALIBRATION_PROMPTS.failed))
    }
  }
}
