import type { ZoomEvt } from '../contracts/input'
import { PINCH_ZOOM_AXIS_RATIO, PINCH_ZOOM_DEAD_ZONE, PINCH_ZOOM_GAIN } from './constants'
import type { Vec2 } from './types'

/**
 * Зум щипком одной рукой, как зум одним пальцем в картах: сомкнул щипок и ведёшь руку вверх —
 * доска приближается, вниз — отдаляется. Чистая функция по кадрам.
 *
 * Масштаб меняется экспоненциально от вертикального пути: factor = exp(-dy * gain), поэтому
 * ход вверх и вниз на одно расстояние даёт взаимно обратные масштабы и доска возвращается туда же.
 * Центр масштаба — точка курсора в момент, когда щипок сомкнулся: курсор на время зума стоит.
 *
 * Первый кадр только ставит точку отсчёта: путь руки, пройденный, пока голосование набирало
 * кадры, в зум не попадает. Кадр, где сырая поза уже не щипок, ничего не меняет: смена формы
 * кисти сдвигает центр ладони, и это не движение руки. Ход вбок не зумит: шаг, где горизонталь
 * заметно длиннее вертикали, только переносит точку отсчёта.
 */

export interface PinchZoomState {
  /** undefined — зума нет. */
  readonly anchor: Vec2 | undefined
  /** Центр масштаба в долях экрана, ставится на первом кадре. */
  readonly center: Vec2 | undefined
}

export interface PinchZoomInput {
  /** Устойчивая поза — щипок, рука ничего не держит, двумя руками не зумят. */
  readonly active: boolean
  /** Сырая поза кадра тоже щипок: координатам этого кадра можно верить. */
  readonly steady: boolean
  /** Сглаженная точка руки в долях экрана. */
  readonly p: Vec2
  /** Курсор, который видит пользователь: на первом кадре становится центром масштаба. */
  readonly cursor: Vec2
}

export interface PinchZoomParams {
  readonly gain: number
  readonly deadZone: number
  readonly axisRatio: number
}

export const DEFAULT_PINCH_ZOOM: PinchZoomParams = {
  gain: PINCH_ZOOM_GAIN,
  deadZone: PINCH_ZOOM_DEAD_ZONE,
  axisRatio: PINCH_ZOOM_AXIS_RATIO,
}

export interface PinchZoomStep {
  readonly state: PinchZoomState
  readonly zoom?: ZoomEvt
}

const IDLE: PinchZoomState = { anchor: undefined, center: undefined }

export const initialPinchZoom = (): PinchZoomState => IDLE

export const isPinchZooming = (s: PinchZoomState): boolean => s.anchor !== undefined

export function stepPinchZoom(s: PinchZoomState, i: PinchZoomInput, p: PinchZoomParams = DEFAULT_PINCH_ZOOM): PinchZoomStep {
  if (!i.active) return { state: IDLE }
  if (!s.anchor || !s.center) return { state: { anchor: i.p, center: i.cursor } }
  if (!i.steady) return { state: s }
  const dx = i.p.x - s.anchor.x
  const dy = i.p.y - s.anchor.y
  if (Math.abs(dy) < p.deadZone) return { state: s }
  const moved: PinchZoomState = { anchor: i.p, center: s.center }
  if (Math.abs(dx) > Math.abs(dy) * p.axisRatio) return { state: moved }
  return { state: moved, zoom: { factor: Math.exp(-dy * p.gain), cx: s.center.x, cy: s.center.y } }
}
