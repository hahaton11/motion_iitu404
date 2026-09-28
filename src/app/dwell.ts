/**
 * Нажатие кнопки удержанием открытой ладони. Чистая логика: цель под прицелом, closure и время на входе.
 * После срабатывания кнопка снова взводится, только когда прицел ушёл с неё.
 */

export const DWELL_MS = 1000
/** Ладонь считается открытой ниже этого closure. */
export const OPEN_CLOSURE = 0.35

export interface DwellState {
  readonly target?: string
  readonly since: number
  readonly fired: boolean
}

export interface DwellInput {
  /** id кнопки под прицелом. */
  readonly target?: string
  readonly closure: number
  readonly t: number
}

export interface DwellResult {
  readonly state: DwellState
  /** Прогресс для кольца на кнопке 0..1. */
  readonly progress: number
  readonly fire?: string
}

export const initialDwell = (): DwellState => ({ since: 0, fired: false })

export function stepDwell(s: DwellState, input: DwellInput, dwellMs = DWELL_MS): DwellResult {
  const { target, closure, t } = input
  if (target === undefined) return { state: initialDwell(), progress: 0 }
  if (target !== s.target) return { state: { target, since: t, fired: false }, progress: 0 }
  if (s.fired) return { state: s, progress: 0 }
  if (closure > OPEN_CLOSURE) return { state: { target, since: t, fired: false }, progress: 0 }
  const progress = Math.min(1, (t - s.since) / dwellMs)
  if (progress < 1) return { state: s, progress }
  return { state: { ...s, fired: true }, progress: 1, fire: target }
}
