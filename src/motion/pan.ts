import { PAN_GAIN, PAN_MIN_STEP } from './constants'
import type { Vec2 } from './types'

/**
 * Панорама жестом двух пальцев для одной руки. Чистая функция по кадрам.
 *
 * Первый кадр жеста только ставит точку отсчёта: всё, что рука прошла, пока классификатор набирал
 * голоса за позу, в панораму не попадает, и доска не дёргается в момент начала. Дальше каждый шаг
 * руки дальше порога уходит наружу целиком, и точка отсчёта переезжает на руку.
 *
 * Кадр, где сырая поза уже не та (пальцы складываются, а устойчивая поза ещё держится), точку
 * не двигает и ничего не шлёт: смена формы кисти сдвигает центр ладони, и это не движение руки.
 */

export interface PanState {
  /** undefined — панорамы нет. */
  readonly anchor: Vec2 | undefined
}

export interface PanInput {
  /** Устойчивая поза — жест панорамы, рука ничего не держит, двумя руками не зумят. */
  readonly active: boolean
  /** Сырая поза кадра тоже жест панорамы: координатам этого кадра можно верить. */
  readonly steady: boolean
  /** Сглаженная точка руки в долях экрана. */
  readonly p: Vec2
}

export interface PanParams {
  readonly minStep: number
  readonly gain: number
}

export const DEFAULT_PAN: PanParams = { minStep: PAN_MIN_STEP, gain: PAN_GAIN }

export interface PanStep {
  readonly state: PanState
  /** Сдвиг доски в долях экрана, если он есть в этом кадре. */
  readonly delta?: Vec2
}

const IDLE: PanState = { anchor: undefined }

export const initialPan = (): PanState => IDLE

export const isPanning = (s: PanState): boolean => s.anchor !== undefined

export function stepPan(s: PanState, i: PanInput, p: PanParams = DEFAULT_PAN): PanStep {
  if (!i.active) return { state: IDLE }
  if (!s.anchor) return { state: { anchor: i.p } }
  if (!i.steady) return { state: s }
  const dx = i.p.x - s.anchor.x
  const dy = i.p.y - s.anchor.y
  if (Math.hypot(dx, dy) < p.minStep) return { state: s }
  return { state: { anchor: i.p }, delta: { x: dx * p.gain, y: dy * p.gain } }
}
