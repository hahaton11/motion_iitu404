/**
 * Разрешение на микрофон для голосового ввода. Сам звук приложению не нужен:
 * Web Speech API берёт уже выданное странице разрешение, поэтому дорожки сразу останавливаются.
 */

/** Итог запроса микрофона. unknown — ещё не спрашивали, asking — ждём ответа человека. */
export type MicAccess = 'unknown' | 'asking' | 'granted' | 'denied' | 'missing' | 'unavailable'

export type GetUserMedia = (c: MediaStreamConstraints) => Promise<MediaStream>

const BY_NAME: Readonly<Record<string, MicAccess>> = {
  NotAllowedError: 'denied',
  PermissionDeniedError: 'denied',
  SecurityError: 'denied',
  NotFoundError: 'missing',
  DevicesNotFoundError: 'missing',
  OverconstrainedError: 'missing',
}

/** Состояние микрофона по исключению getUserMedia. Неизвестная ошибка — микрофон недоступен. */
export function micAccessFromError(err: unknown): MicAccess {
  const name = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : ''
  return BY_NAME[name] ?? 'unavailable'
}

/** Ответ уже получен: спрашивать снова не нужно. */
export const micSettled = (s: MicAccess): boolean => s !== 'unknown' && s !== 'asking'

/** Останавливает и убирает из потока звуковые дорожки, видео остаётся. */
export function dropAudio(stream: MediaStream): MediaStream {
  stream.getAudioTracks().forEach((t) => {
    t.stop()
    stream.removeTrack(t)
  })
  return stream
}

/** getUserMedia браузера или undefined, если API нет (не https, старый браузер). */
export function browserGetUserMedia(): GetUserMedia | undefined {
  const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
  return md?.getUserMedia ? (c) => md.getUserMedia(c) : undefined
}

/** Отдельный запрос микрофона: режим мыши, где камеры нет. Никогда не бросает. */
export async function requestMicrophone(gum: GetUserMedia | undefined = browserGetUserMedia()): Promise<MicAccess> {
  if (!gum) return 'unavailable'
  try {
    const stream = await gum({ audio: true, video: false })
    stream.getTracks().forEach((t) => t.stop())
    return 'granted'
  } catch (err) {
    return micAccessFromError(err)
  }
}
