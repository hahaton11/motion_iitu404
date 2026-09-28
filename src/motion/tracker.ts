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

/** HandLandmarker в режиме VIDEO: модель и wasm из public/, GPU с откатом на CPU. */

export type Delegate = 'GPU' | 'CPU'

export interface TrackerOptions {
  /** Путь к модели относительно страницы. */
  readonly modelPath?: string
  /** Папка с wasm относительно страницы. */
  readonly wasmPath?: string
}

export class TrackerLoadError extends Error {
  constructor(readonly cause?: unknown) {
    super('Обнови страницу: модель распознавания рук не загрузилась')
    this.name = 'TrackerLoadError'
  }
}

const resolveUrl = (path: string): string => new URL(path, document.baseURI).href

async function createLandmarker(wasmUrl: string, modelUrl: string, delegate: Delegate): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(wasmUrl)
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelUrl, delegate },
    runningMode: 'VIDEO',
    numHands: NUM_HANDS,
    minHandDetectionConfidence: MIN_DETECTION_CONFIDENCE,
    minHandPresenceConfidence: MIN_PRESENCE_CONFIDENCE,
    minTrackingConfidence: MIN_TRACKING_CONFIDENCE,
  })
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
      return new HandTracker(await createLandmarker(wasmUrl, modelUrl, 'GPU'), 'GPU')
    } catch {
      try {
        return new HandTracker(await createLandmarker(wasmUrl, modelUrl, 'CPU'), 'CPU')
      } catch (err) {
        throw new TrackerLoadError(err)
      }
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
