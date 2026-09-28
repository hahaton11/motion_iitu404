import type { SpeechChunk } from './transcript'

/**
 * Обёртка Web Speech API. Типы описаны здесь минимально: в lib.dom их нет во всех версиях,
 * а в Chrome конструктор живёт под префиксом webkit.
 */

interface RecognitionAlternative {
  readonly transcript: string
}

interface RecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: RecognitionAlternative | undefined
}

interface RecognitionResultList {
  readonly length: number
  readonly [index: number]: RecognitionResult | undefined
}

interface RecognitionEvent {
  readonly results: RecognitionResultList
}

interface RecognitionErrorEvent {
  readonly error: string
}

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onspeechstart: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionCtor = new () => Recognition

export type SpeechErrorCode = 'denied' | 'no-speech' | 'network' | 'audio' | 'other'

export interface SpeechHandlers {
  /** Все результаты сессии целиком, каждый раз заново. */
  readonly onResult: (chunks: readonly SpeechChunk[]) => void
  readonly onError: (code: SpeechErrorCode) => void
  /** Распознавание закончилось по любой причине. */
  readonly onEnd: () => void
}

export interface SpeechSession {
  /** Попросить закончить: придут финальные результаты, затем onEnd. */
  stop(): void
  /** Прервать без результатов. */
  abort(): void
}

export const SPEECH_LANG = 'ru-RU'

function ctor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const speechSupported = (): boolean => ctor() !== undefined

const ERROR_CODES: Readonly<Record<string, SpeechErrorCode>> = {
  'not-allowed': 'denied',
  'service-not-allowed': 'denied',
  'no-speech': 'no-speech',
  network: 'network',
  'audio-capture': 'audio',
}

function chunksOf(list: RecognitionResultList): readonly SpeechChunk[] {
  const out: SpeechChunk[] = []
  for (let i = 0; i < list.length; i++) {
    const r = list[i]
    const alt = r?.[0]
    if (r && alt) out.push({ text: alt.transcript, isFinal: r.isFinal })
  }
  return out
}

/** Запускает распознавание. undefined, если API в браузере нет или запуск не удался. */
export function startSpeech(handlers: SpeechHandlers, lang = SPEECH_LANG): SpeechSession | undefined {
  const Ctor = ctor()
  if (!Ctor) return undefined
  const rec = new Ctor()
  rec.lang = lang
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1
  rec.onresult = (e) => handlers.onResult(chunksOf(e.results))
  rec.onerror = (e) => {
    if (e.error !== 'aborted') handlers.onError(ERROR_CODES[e.error] ?? 'other')
  }
  rec.onend = () => handlers.onEnd()
  try {
    rec.start()
  } catch {
    return undefined
  }
  return {
    stop: () => rec.stop(),
    abort: () => {
      rec.onresult = null
      rec.onerror = null
      rec.abort()
    },
  }
}
