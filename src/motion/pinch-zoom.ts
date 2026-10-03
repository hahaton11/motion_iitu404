import type { ZoomEvt } from '../contracts/input'
import { PINCH_SIDEWAYS_MIN, PINCH_TILT_GAIN_DEG, PINCH_ZOOM_AXIS_RATIO, PINCH_ZOOM_DEAD_ZONE, PINCH_ZOOM_GAIN } from './constants'
import type { Vec2 } from './types'

/**
 * Щипок одной рукой: ход вверх и вниз масштабирует доску, ход вбок кренит её плоскость.
 * Одна поза, две оси — как зум одним пальцем в картах, только с добавленным наклоном.
 * Чистая функция по кадрам.
 *
 * Масштаб меняется экспоненциально от вертикального пути: factor = exp(-dy * gain), поэтому
 * ход вверх и вниз на одно расстояние даёт взаимно обратные масштабы и доска возвращается туда же.
 * Центр масштаба — точка курсора в момент, когда щипок сомкнулся: курсор на время зума стоит.
 *
 * Первый кадр только ставит точку отсчёта: путь руки, пройденный, пока голосование набирало
 * кадры, в зум не попадает. Кадр, где сырая поза уже не щипок, ничего не меняет: смена формы
 * кисти сдвигает центр ладони, и это не движение руки.
 *
 * Шаг, где горизонталь заметно длиннее вертикали, масштаб не меняет: он кренит плоскость доски.
 * Наклон — приращение от хода вбок, а не абсолютный угол: рука не знает, какой наклон сейчас.
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
  /** Ход вбок от точки отсчёта, с которого движение считается намеренно боковым. */
  readonly sidewaysMin: number
  /** Градусов наклона на ход вбок во всю ширину экрана. */
  readonly tiltGain: number
}

export const DEFAULT_PINCH_ZOOM: PinchZoomParams = {
  gain: PINCH_ZOOM_GAIN,
  deadZone: PINCH_ZOOM_DEAD_ZONE,
  axisRatio: PINCH_ZOOM_AXIS_RATIO,
  sidewaysMin: PINCH_SIDEWAYS_MIN,
  tiltGain: PINCH_TILT_GAIN_DEG,
}

export interface PinchZoomStep {
  readonly state: PinchZoomState
  readonly zoom?: ZoomEvt
  /**
   * Приращение наклона плоскости доски в градусах. Ход вбок той же позой: раньше он не делал
   * ничего и объяснялся подсказкой, теперь кренит доску. Оси разделены жёстко — шаг меняет
   * либо масштаб, либо наклон, но никогда оба сразу, иначе диагональный дрейф руки делал бы
   * и то и другое понемногу.
   */
  readonly tilt?: number
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
  // Ход вбок виден и тогда, когда по вертикали рука не двинулась вовсе: именно так и выглядит
  // попытка «покрутить» доску щипком. Пока ход не дотянул до порога, точка отсчёта стоит
  // на месте и ход накапливается — иначе медленное боковое движение не дотягивало бы никогда.
  const sideways = Math.abs(dx) > p.sidewaysMin && Math.abs(dx) > Math.abs(dy) * p.axisRatio
  const moved: PinchZoomState = { anchor: i.p, center: s.center }
  if (sideways) return { state: moved, tilt: dx * p.tiltGain }
  if (Math.abs(dy) < p.deadZone) return { state: s }
  if (Math.abs(dx) > Math.abs(dy) * p.axisRatio) return { state: moved }
  return { state: moved, zoom: { factor: Math.exp(-dy * p.gain), cx: s.center.x, cy: s.center.y } }
}
