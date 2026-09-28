/**
 * Имя для таблицы рекордов голосом: одна короткая фраза через Web Speech API.
 * Голос S3 пишет только в стикеры доски, поэтому здесь своя минимальная обёртка.
 */

interface NameRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { readonly results: ArrayLike<ArrayLike<{ readonly transcript: string }>> }) => void) | null
  onerror: ((e: { readonly error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

type Ctor = new () => NameRecognition

const LANG = 'ru-RU'

function ctor(): Ctor | undefined {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const nameVoiceSupported = (): boolean => ctor() !== undefined

export const NAME_VOICE_ERRORS: Readonly<Record<string, string>> = {
  'not-allowed': 'Разреши доступ к микрофону в адресной строке, чтобы сказать имя',
  'no-speech': 'Скажи имя громче, сразу после нажатия',
  network: 'Проверь интернет: Chrome распознаёт речь через сеть',
  other: 'Выбери прозвище кнопкой или попробуй сказать имя ещё раз',
}

/** Слушает одну фразу. Разрешается текстом или отклоняется с понятным сообщением. */
export function listenName(): { readonly result: Promise<string>; readonly cancel: () => void } {
  const C = ctor()
  if (!C) return { result: Promise.reject(new Error(NAME_VOICE_ERRORS.other)), cancel: () => undefined }
  const rec = new C()
  rec.lang = LANG
  rec.continuous = false
  rec.interimResults = false
  rec.maxAlternatives = 1
  const result = new Promise<string>((resolve, reject) => {
    let heard = ''
    rec.onresult = (e) => (heard = e.results[0]?.[0]?.transcript ?? '')
    rec.onerror = (e) => reject(new Error(NAME_VOICE_ERRORS[e.error] ?? NAME_VOICE_ERRORS.other))
    rec.onend = () => (heard ? resolve(heard) : reject(new Error(NAME_VOICE_ERRORS['no-speech'])))
    try {
      rec.start()
    } catch {
      reject(new Error(NAME_VOICE_ERRORS.other))
    }
  })
  return { result, cancel: () => rec.abort() }
}
