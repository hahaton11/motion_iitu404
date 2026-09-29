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
import type { LoadMeter } from './loading'

/** HandLandmarker в режиме VIDEO: модель и wasm из public/, GPU с откатом на CPU. */

export type Delegate = 'GPU' | 'CPU'

export interface TrackerOptions {
  /** Путь к модели относительно страницы. */
  readonly modelPath?: string
  /** Папка с wasm относительно страницы. */
  readonly wasmPath?: string
  /** Счётчик загрузки: считает байты модели кисти и прогревает кэш wasm. */
  readonly meter?: LoadMeter
}

export class TrackerLoadError extends Error {
  constructor(readonly cause?: unknown) {
    super('Обнови страницу: модель распознавания рук не загрузилась')
    this.name = 'TrackerLoadError'
  }
}

const resolveUrl = (path: string): string => new URL(path, document.baseURI).href

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
type ModelSource = { readonly modelAssetBuffer: Uint8Array } | { readonly modelAssetPath: string }

async function createLandmarker(fileset: Fileset, source: ModelSource, delegate: Delegate): Promise<HandLandmarker> {
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { ...source, delegate },
    runningMode: 'VIDEO',
    numHands: NUM_HANDS,
    minHandDetectionConfidence: MIN_DETECTION_CONFIDENCE,
    minHandPresenceConfidence: MIN_PRESENCE_CONFIDENCE,
    minTrackingConfidence: MIN_TRACKING_CONFIDENCE,
  })
}

/**
 * Модель кисти скачивается своим кодом ради счётчика и отдаётся буфером, wasm только прогревает
 * кэш браузера: его адрес выбирает сам MediaPipe и загружает его сам. Оба файла статические
 * и приходят с ETag, поэтому вторая загрузка достаётся из кэша. Сбой здесь не фатален —
 * без буфера MediaPipe возьмёт модель по адресу, просто счётчик недосчитает байты.
 */
async function prefetch(fileset: Fileset, modelUrl: string, meter: LoadMeter | undefined): Promise<Uint8Array | undefined> {
  if (!meter) return undefined
  const [model] = await Promise.all([
    meter.fetch('model', modelUrl).catch(() => undefined),
    meter.warm('wasm', fileset.wasmBinaryPath).catch(() => undefined),
  ])
  return model
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
    try {
      const fileset = await FilesetResolver.forVisionTasks(wasmUrl)
      const model = await prefetch(fileset, modelUrl, opts.meter)
      // Буфер отдаётся свежей копией: откат на CPU создаёт распознаватель второй раз.
      const source = (): ModelSource => (model ? { modelAssetBuffer: new Uint8Array(model) } : { modelAssetPath: modelUrl })
      try {
        return new HandTracker(await createLandmarker(fileset, source(), 'GPU'), 'GPU')
      } catch {
        return new HandTracker(await createLandmarker(fileset, source(), 'CPU'), 'CPU')
      }
    } catch (err) {
      throw new TrackerLoadError(err)
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
