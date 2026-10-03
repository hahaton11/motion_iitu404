import type { MicAccess } from '../shared/microphone'
import type { CameraPhase } from './context'
import type { InputMode } from './flow'

/**
 * Статус разрешений камеры и микрофона для экранов старта и камеры и подсказка голоса на доске.
 * Чистые функции: состояние разрешений превращается в текст, что сделать человеку.
 */

/** ok — разрешено, wait — ждём ответа, off — недоступно. */
export type PermissionMark = 'ok' | 'wait' | 'off'

export interface PermissionLine {
  readonly label: string
  readonly mark: PermissionMark
}

const SIGN: Readonly<Record<PermissionMark, string>> = { ok: '✓', wait: '…', off: '✗' }

const line = (name: string, mark: PermissionMark): PermissionLine => ({ label: `${name} ${SIGN[mark]}`, mark })

const CAMERA_MARK: Readonly<Record<CameraPhase, PermissionMark>> = { off: 'wait', loading: 'wait', ready: 'ok', failed: 'off' }

export const cameraLine = (phase: CameraPhase): PermissionLine => line('Камера', CAMERA_MARK[phase])

/** Голос работает, только если микрофон разрешён и браузер умеет распознавать речь. */
export function micLine(mic: MicAccess, speech: boolean): PermissionLine {
  if (mic === 'unknown' || mic === 'asking') return line('Микрофон', 'wait')
  return line('Микрофон', mic === 'granted' && speech ? 'ok' : 'off')
}

export const MIC_ADVICE = {
  denied:
    'Голос выключен, остальное работает. Чтобы диктовать текст в стикеры, нажми на значок слева в адресной строке, разреши микрофон и обнови страницу',
  missing: 'Голос выключен, остальное работает. Подключи микрофон и обнови страницу, чтобы диктовать',
  unavailable: 'Голос может не работать: закрой другие приложения с микрофоном и обнови страницу',
  noSpeech: 'Голосовой ввод работает в Chrome: открой доску в нём, чтобы диктовать',
} as const

/** Что сделать, чтобы включить голос. undefined — всё в порядке или ответа ещё нет. */
export function micAdvice(mic: MicAccess, speech: boolean): string | undefined {
  if (mic === 'denied' || mic === 'missing' || mic === 'unavailable') return MIC_ADVICE[mic]
  return mic === 'granted' && !speech ? MIC_ADVICE.noSpeech : undefined
}

/** Как начать диктовку тем же жестом, что выделяет стикер: point на стикере. */
export const DICTATE_TIP: Readonly<Record<InputMode, string>> = {
  camera: 'Укажи пальцем на стикер и задержи — потом говори текст',
  mouse: 'Shift и удержи кнопку мыши на стикере — потом говори текст',
}

export const VOICE_OFF_TIP = {
  denied: 'Разреши микрофон в адресной строке, чтобы диктовать',
  missing: 'Подключи микрофон, чтобы диктовать',
  noSpeech: 'Открой доску в Chrome, чтобы диктовать',
} as const

/** Подсказка над стикером под прицелом или выделенным: как начать диктовку или что включить. */
export function voiceTip(mic: MicAccess, mode: InputMode, speech: boolean): string {
  if (!speech) return VOICE_OFF_TIP.noSpeech
  if (mic === 'denied' || mic === 'missing') return VOICE_OFF_TIP[mic]
  return DICTATE_TIP[mode]
}
