/** Чистая логика диктовки: сбор результатов распознавания и тайминги окончания. */

/** Пауза в речи, после которой диктовка заканчивается. */
export const SILENCE_MS = 1500
/** Если за это время не сказано ни слова, диктовка заканчивается сама. */
export const START_TIMEOUT_MS = 7000
/** После просьбы остановиться ждём финальный результат не дольше этого. */
export const STOP_TIMEOUT_MS = 1500
/** Повторный point раньше этого после старта считается тем же самым жестом. */
export const POINT_GUARD_MS = 400
/** Предел длины текста стикера. */
export const MAX_TEXT = 500

export interface SpeechChunk {
  readonly text: string
  readonly isFinal: boolean
}

export interface Transcript {
  readonly final: string
  readonly interim: string
}

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** Склеивает все результаты сессии: финальные отдельно, промежуточные отдельно. */
export function collect(chunks: readonly SpeechChunk[]): Transcript {
  const pick = (final: boolean) => clean(chunks.filter((c) => c.isFinal === final).map((c) => c.text).join(' '))
  return { final: pick(true), interim: pick(false) }
}

/** Текст для стикера: с заглавной буквы, без лишних пробелов, не длиннее предела. */
export function stickyText(t: Transcript): string {
  const text = clean(`${t.final} ${t.interim}`).slice(0, MAX_TEXT)
  return text ? text.charAt(0).toLocaleUpperCase('ru-RU') + text.slice(1) : ''
}

/** Момент, когда диктовку пора закончить: пауза после последней речи или таймаут старта. */
export function stopAt(startedAt: number, lastSpeechAt: number | undefined): number {
  return lastSpeechAt === undefined ? startedAt + START_TIMEOUT_MS : lastSpeechAt + SILENCE_MS
}
