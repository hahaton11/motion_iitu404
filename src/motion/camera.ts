import { dropAudio, micAccessFromError, type GetUserMedia, type MicAccess } from '../shared/microphone'
import { CAMERA_FPS, CAMERA_HEIGHT, CAMERA_WIDTH } from './constants'

/** Доступ к фронтальной камере. Ошибки переводятся в понятный текст с действием. */

export type CameraErrorCode = 'denied' | 'not-found' | 'busy' | 'insecure' | 'unsupported' | 'unknown'

export const CAMERA_ERROR_TEXTS: Readonly<Record<CameraErrorCode, string>> = {
  denied: 'Разреши доступ к камере в адресной строке браузера и обнови страницу',
  'not-found': 'Подключи веб-камеру и обнови страницу',
  busy: 'Закрой другие приложения, которые используют камеру, и обнови страницу',
  insecure: 'Открой страницу по https или с localhost, чтобы включить камеру',
  unsupported: 'Открой страницу в свежем Chrome, этот браузер не даёт доступ к камере',
  unknown: 'Обнови страницу и попробуй снова или включи режим мыши',
}

export class CameraError extends Error {
  constructor(
    readonly code: CameraErrorCode,
    readonly cause?: unknown,
  ) {
    super(CAMERA_ERROR_TEXTS[code])
    this.name = 'CameraError'
  }
}

const BY_NAME: Readonly<Record<string, CameraErrorCode>> = {
  NotAllowedError: 'denied',
  PermissionDeniedError: 'denied',
  SecurityError: 'denied',
  NotFoundError: 'not-found',
  DevicesNotFoundError: 'not-found',
  OverconstrainedError: 'not-found',
  NotReadableError: 'busy',
  TrackStartError: 'busy',
  AbortError: 'busy',
}

/** Код ошибки getUserMedia по имени исключения. */
export function cameraErrorCode(err: unknown): CameraErrorCode {
  if (err instanceof CameraError) return err.code
  const name = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : ''
  return BY_NAME[name] ?? 'unknown'
}

/** Запрашиваемый размер и частота съёмки. Размер кадра — главная статья расходов распознавания. */
export interface CameraSize {
  readonly width: number
  readonly height: number
  readonly fps: number
}

export const DEFAULT_CAMERA_SIZE: CameraSize = { width: CAMERA_WIDTH, height: CAMERA_HEIGHT, fps: CAMERA_FPS }

export const cameraConstraints = (s: CameraSize = DEFAULT_CAMERA_SIZE): MediaStreamConstraints => ({
  audio: false,
  video: {
    width: { ideal: s.width },
    height: { ideal: s.height },
    frameRate: { ideal: s.fps },
    facingMode: 'user',
  },
})

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = cameraConstraints()

export interface CameraStream {
  readonly stream: MediaStream
  /** Ответ про микрофон. Нет, если микрофон не спрашивали. */
  readonly mic?: MicAccess
}

/**
 * Камера, а с withMic ещё и микрофон одним запросом: браузер покажет одно окно на оба.
 * Звук сразу останавливается. Если общий запрос не прошёл, камера просится отдельно,
 * чтобы отказ в микрофоне не выключил её. Ошибку камеры бросает как есть.
 */
export async function acquireCamera(gum: GetUserMedia, video: MediaStreamConstraints, withMic: boolean): Promise<CameraStream> {
  if (!withMic) return { stream: await gum(video) }
  try {
    return { stream: dropAudio(await gum({ ...video, audio: true })), mic: 'granted' }
  } catch (err) {
    const stream = await gum(video)
    return { stream, mic: micAccessFromError(err) }
  }
}

/** Включает камеру и запускает видео. Бросает CameraError. */
export async function openCamera(video: HTMLVideoElement, size?: CameraSize, withMic = false): Promise<CameraStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(window.isSecureContext ? 'unsupported' : 'insecure')
  }
  const md = navigator.mediaDevices
  let got: CameraStream
  try {
    got = await acquireCamera((c) => md.getUserMedia(c), cameraConstraints(size), withMic)
  } catch (err) {
    throw new CameraError(cameraErrorCode(err), err)
  }
  video.srcObject = got.stream
  video.muted = true
  video.playsInline = true
  await video.play()
  return got
}

export function closeCamera(stream: MediaStream | undefined, video?: HTMLVideoElement): void {
  stream?.getTracks().forEach((t) => t.stop())
  if (video) video.srcObject = null
}
