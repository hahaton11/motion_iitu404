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

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    width: { ideal: CAMERA_WIDTH },
    height: { ideal: CAMERA_HEIGHT },
    frameRate: { ideal: CAMERA_FPS },
    facingMode: 'user',
  },
}

/** Включает камеру и запускает видео. Бросает CameraError. */
export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(window.isSecureContext ? 'unsupported' : 'insecure')
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)
  } catch (err) {
    throw new CameraError(cameraErrorCode(err), err)
  }
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()
  return stream
}

export function closeCamera(stream: MediaStream | undefined, video?: HTMLVideoElement): void {
  stream?.getTracks().forEach((t) => t.stop())
  if (video) video.srcObject = null
}
