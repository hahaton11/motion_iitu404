import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'
import {
  MIN_DETECTION_CONFIDENCE,
  MIN_PRESENCE_CONFIDENCE,
  MIN_TRACKING_CONFIDENCE,
  MODEL_PATH,
  NUM_HANDS,
  WASM_PATH,
} from './constants'
import type { RawHand } from './landmarks'
import type { Bytes, LoadMeter } from './loading'

/** HandLandmarker в режиме VIDEO: модель и wasm из public/, GPU с откатом на CPU. */

export type Delegate = 'GPU' | 'CPU'

export interface TrackerOptions {
  /** Путь к модели относительно страницы. */
  readonly modelPath?: string
  /** Папка с wasm относительно страницы. */
  readonly wasmPath?: string
  /** Счётчик загрузки: считает байты модели кисти и прогревает кэш wasm. */
  readonly meter?: LoadMeter
  /** Принудительный делегат вместо «GPU с откатом на CPU». Для замеров производительности. */
  readonly delegate?: Delegate
  /** Сколько рук искать. Две нужны для зума, но каждая рука стоит времени на кадре. */
  readonly numHands?: number
}

export class TrackerLoadError extends Error {
  constructor(readonly cause?: unknown) {
    super('Обнови страницу: модель распознавания рук не загрузилась')
    this.name = 'TrackerLoadError'
  }
}

const resolveUrl = (path: string): string => new URL(path, document.baseURI).href

/** Тип обязателен: без него instantiateStreaming не берёт blob и откатывается на медленный путь. */
const WASM_MIME = 'application/wasm'

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
type ModelSource = { readonly modelAssetBuffer: Uint8Array } | { readonly modelAssetPath: string }

async function createLandmarker(
  fileset: Fileset,
  source: ModelSource,
  delegate: Delegate,
  numHands = NUM_HANDS,
): Promise<HandLandmarker> {
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { ...source, delegate },
    runningMode: 'VIDEO',
    numHands,
    minHandDetectionConfidence: MIN_DETECTION_CONFIDENCE,
    minHandPresenceConfidence: MIN_PRESENCE_CONFIDENCE,
    minTrackingConfidence: MIN_TRACKING_CONFIDENCE,
  })
}

interface Prepared {
  /** Набор файлов MediaPipe: wasm подменён на уже скачанные байты. */
  readonly fileset: Fileset
  readonly model: Bytes | undefined
  readonly release: () => void
}

/**
 * Оба больших файла скачиваются своим кодом — иначе их байты не посчитать, а до первого кадра
 * их около 20 МБ. Модель кисти уходит дальше буфером. Для wasm буфера в API нет, поэтому
 * MediaPipe получает адрес blob'а: полагаться на кэш браузера нельзя, Chrome на чистом профиле
 * держит кэш в памяти и файл такого размера в него не кладёт — получалась двойная загрузка.
 * Сбой любого из двух не фатален: MediaPipe возьмёт файл по обычному адресу сам.
 */
async function prepare(fileset: Fileset, modelUrl: string, meter: LoadMeter | undefined): Promise<Prepared> {
  if (!meter) return { fileset, model: undefined, release: () => undefined }
  const [model, wasm] = await Promise.all([
    meter.fetch('model', modelUrl).catch(() => undefined),
    meter.fetch('wasm', fileset.wasmBinaryPath).catch(() => undefined),
  ])
  if (!wasm) return { fileset, model, release: () => undefined }
  const url = URL.createObjectURL(new Blob([wasm], { type: WASM_MIME }))
  return { fileset: { ...fileset, wasmBinaryPath: url }, model, release: () => URL.revokeObjectURL(url) }
}

/** Перевод результата MediaPipe в сырые руки. */
export function toRawHands(result: HandLandmarkerResult): RawHand[] {
  return result.landmarks.map((landmarks, i) => {
    const category = result.handedness[i]?.[0]
    return {
      label: category?.categoryName ?? '',
      score: category?.score ?? 0,
      landmarks,
      world: result.worldLandmarks[i] ?? landmarks,
    }
  })
}

export class HandTracker {
  private lastTs = -1

  private constructor(
    private readonly landmarker: HandLandmarker,
    readonly delegate: Delegate,
  ) {}

  static async create(opts: TrackerOptions = {}): Promise<HandTracker> {
    const wasmUrl = resolveUrl(opts.wasmPath ?? WASM_PATH)
    const modelUrl = resolveUrl(opts.modelPath ?? MODEL_PATH)
    let release = (): void => undefined
    try {
      const resolved = await FilesetResolver.forVisionTasks(wasmUrl)
      const ready = await prepare(resolved, modelUrl, opts.meter)
      release = ready.release
      // Буфер отдаётся свежей копией: откат на CPU создаёт распознаватель второй раз.
      const source = (): ModelSource =>
        ready.model ? { modelAssetBuffer: new Uint8Array(ready.model) } : { modelAssetPath: modelUrl }
      const first = opts.delegate ?? 'GPU'
      const fallback: Delegate = first === 'GPU' ? 'CPU' : 'GPU'
      try {
        return new HandTracker(await createLandmarker(ready.fileset, source(), first, opts.numHands), first)
      } catch {
        return new HandTracker(await createLandmarker(ready.fileset, source(), fallback, opts.numHands), fallback)
      }
    } catch (err) {
      throw new TrackerLoadError(err)
    } finally {
      release()
    }
  }

  /** Распознавание кадра. Метки времени обязаны расти, повторный кадр пропускается. */
  detect(video: HTMLVideoElement, t: number): RawHand[] | undefined {
    const ts = Math.max(t, this.lastTs + 1)
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return undefined
    this.lastTs = ts
    return toRawHands(this.landmarker.detectForVideo(video, ts))
  }

  close(): void {
    this.landmarker.close()
  }
}

/**
 * Цикл по кадрам видео: requestVideoFrameCallback, где он есть, иначе requestAnimationFrame
 * с пропуском повторных кадров. Возвращает функцию остановки.
 */
export function runVideoLoop(video: HTMLVideoElement, onFrame: (t: number) => void): () => void {
  let stopped = false
  const hasVideoFrameCallback = 'requestVideoFrameCallback' in HTMLVideoElement.prototype
  if (hasVideoFrameCallback) {
    let handle = 0
    const tick = (now: number): void => {
      if (stopped) return
      onFrame(now)
      handle = video.requestVideoFrameCallback(tick)
    }
    handle = video.requestVideoFrameCallback(tick)
    return () => {
      stopped = true
      video.cancelVideoFrameCallback(handle)
    }
  }
  let lastTime = -1
  let raf = 0
  const tick = (now: number): void => {
    if (stopped) return
    if (video.currentTime !== lastTime) {
      lastTime = video.currentTime
      onFrame(now)
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => {
    stopped = true
    cancelAnimationFrame(raf)
  }
}
