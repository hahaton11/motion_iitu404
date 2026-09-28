import type { InputSource, Unsubscribe } from '../contracts/input'
import { InputEmitter } from '../shared/emitter'
import {
  CALIBRATION_PROMPTS,
  calibrationProgress,
  startCalibration,
  stepCalibration,
  type CalibrationResult,
  type CalibrationState,
  type CalibrationStep,
} from './calibration'
import { closeCamera, openCamera } from './camera'
import { DEFAULT_THRESHOLDS } from './hand-state'
import { assignHandIds, type RawHand } from './landmarks'
import { initialPipeline, processFrame, withThresholds, type HandDebug, type OutEvent, type PipelineState } from './pipeline'
import { initialStats, stepStats, type FrameStats } from './stats'
import { HandTracker, runVideoLoop, type Delegate, type TrackerOptions } from './tracker'
import type { Thresholds } from './types'

/** Источник ввода с веб-камеры. Реализует контракт InputSource, плюс отладка и калибровка для демо и S4. */

export interface CameraInputOptions extends TrackerOptions {
  /** Видео для показа пользователю. Если не передано, создаётся скрытое. */
  readonly video?: HTMLVideoElement
  /** Пороги после прошлой калибровки. */
  readonly thresholds?: Thresholds
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
  private mediaStream: MediaStream | undefined
  private stopLoop: (() => void) | undefined
  private calibration: CalibrationJob | undefined

  constructor(private readonly opts: CameraInputOptions = {}) {
    this.videoEl = opts.video ?? document.createElement('video')
    this.pipeline = initialPipeline(opts.thresholds ?? DEFAULT_THRESHOLDS)
  }

  on: InputSource['on'] = (type, fn) => this.em.on(type, fn)

  /** Включает камеру и модель. Бросает CameraError или TrackerLoadError с текстом для пользователя. */
  async start(): Promise<void> {
    if (this.stopLoop) return
    const [stream, tracker] = await Promise.all([openCamera(this.videoEl), HandTracker.create(this.opts)]).catch(
      (err: unknown) => {
        this.stop()
        throw err
      },
    )
    this.mediaStream = stream
    this.tracker = tracker
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

  /** Подписка на отладочные данные каждого кадра. */
  onFrame(fn: Listener<FrameInfo>): Unsubscribe {
    this.frameListeners.add(fn)
    return () => this.frameListeners.delete(fn)
  }

  /** Калибровка: «Покажи открытую ладонь», затем «Сожми кулак». При успехе пороги применяются сразу. */
  calibrate(onProgress?: Listener<CalibrationProgress>): Promise<CalibrationResult> {
    this.calibration?.reject(new Error('Калибровка запущена заново'))
    return new Promise((resolve, reject) => {
      this.calibration = { state: undefined, onProgress, resolve, reject }
    })
  }

  private onVideoFrame(t: number): void {
    const tracker = this.tracker
    if (!tracker) return
    const started = performance.now()
    const raw = tracker.detect(this.videoEl, t)
    if (!raw) return
    const r = processFrame(this.pipeline, { t, hands: assignHandIds(raw) })
    this.pipeline = r.state
    r.events.forEach((ev) => this.dispatch(ev))
    this.stats = stepStats(this.stats, t, performance.now() - started)
    this.stepCalibrationJob(t, r.debug)
    const info: FrameInfo = { t, raw, hands: r.debug, thresholds: this.pipeline.thresholds, stats: this.stats, delegate: tracker.delegate }
    this.frameListeners.forEach((fn) => fn(info))
  }

  private dispatch(ev: OutEvent): void {
    // Тип события и полезная нагрузка согласованы конструкцией OutEvent.
    this.em.emit(ev.type, ev.e as never)
  }

  private stepCalibrationJob(t: number, hands: readonly HandDebug[]): void {
    const job = this.calibration
    if (!job) return
    const hand = hands.find((h) => h.hand === 'right') ?? hands[0]
    const state = stepCalibration(job.state ?? startCalibration(t), t, hand?.features.closure)
    job.state = state
    const prompt = state.step === 'failed' ? (state.error ?? CALIBRATION_PROMPTS.failed) : CALIBRATION_PROMPTS[state.step]
    job.onProgress?.({ step: state.step, prompt, progress: calibrationProgress(state, t), error: state.error })
    if (state.step === 'done' && state.result) {
      this.setThresholds(state.result.thresholds)
      this.calibration = undefined
      job.resolve(state.result)
    } else if (state.step === 'failed') {
      this.calibration = undefined
      job.reject(new Error(state.error ?? CALIBRATION_PROMPTS.failed))
    }
  }
}
