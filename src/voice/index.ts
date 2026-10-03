import type { Board } from '../board'
import type { InputSource } from '../contracts/input'
import { VoiceController, type Voice, type VoiceOptions } from './voice'

/**
 * Точка входа голоса S3. input необязателен, но без него повторный point
 * по тому же стикеру не остановит запись: доска о нём не сообщает. Тогда запись закончит пауза.
 */
export function createVoice(board: Board, input?: InputSource, opts?: VoiceOptions): Voice {
  return new VoiceController(board, input, opts)
}

export type { Voice, VoiceEventMap, VoiceOptions } from './voice'
export { DEFAULT_VOICE_TIP, VOICE_HINTS } from './voice'
export { speechSupported } from './speech'
export type { SpeechErrorCode } from './speech'
