import type { Point, Viewport } from './geometry'

/** Постоянная времени следования элемента за рукой: лёгкое инерционное отставание. */
export const FOLLOW_TAU_MS = 55
/** Максимальный наклон удерживаемого элемента, градусы. */
export const TILT_MAX_DEG = 4
/** Градусов наклона на пиксель в секунду горизонтальной скорости. */
export const TILT_PER_PX_S = 0.006
/** Сглаживание наклона, мс. */
export const TILT_TAU_MS = 90
/** Считаем, что элемент догнал цель, если ближе этого в пикселях экрана. */
export const SETTLE_EPS_PX = 0.4

export const THROW_MIN_MS = 380
export const THROW_MAX_MS = 900
/** Бросок пролетает за край экрана ещё на столько пикселей. */
export const THROW_OVERSHOOT_PX = 160
/** Оборотов в градусах на 1000 px/s скорости броска. */
export const THROW_SPIN_PER_1000 = 120
export const THROW_SPIN_MAX = 540

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Коэффициент экспоненциального сглаживания за dt, независимый от частоты кадров. */
export const smoothing = (dtMs: number, tauMs: number): number => 1 - Math.exp(-Math.max(0, dtMs) / tauMs)

export function followStep(pos: Point, target: Point, dtMs: number, tauMs = FOLLOW_TAU_MS): Point {
  const k = smoothing(dtMs, tauMs)
  return { x: pos.x + (target.x - pos.x) * k, y: pos.y + (target.y - pos.y) * k }
}

export const tiltTarget = (vxPxS: number): number => clamp(vxPxS * TILT_PER_PX_S, -TILT_MAX_DEG, TILT_MAX_DEG)

export function tiltStep(tilt: number, vxPxS: number, dtMs: number): number {
  return tilt + (tiltTarget(vxPxS) - tilt) * smoothing(dtMs, TILT_TAU_MS)
}

export interface ThrowPath {
  readonly dx: number
  readonly dy: number
  readonly durationMs: number
  readonly spinDeg: number
}

/** Сколько пройти из точки по направлению (ux, uy), чтобы оказаться за краем экрана. */
function distanceToExit(p: Point, ux: number, uy: number, vp: Viewport): number {
  const tx = ux > 0 ? (vp.w - p.x) / ux : ux < 0 ? -p.x / ux : Infinity
  const ty = uy > 0 ? (vp.h - p.y) / uy : uy < 0 ? -p.y / uy : Infinity
  return Math.max(0, Math.min(tx, ty))
}

/** Траектория броска в пикселях экрана: по вектору скорости, до выхода за край с запасом. */
export function throwPath(start: Point, vxPxS: number, vyPxS: number, vp: Viewport): ThrowPath {
  const speed = Math.hypot(vxPxS, vyPxS)
  const ux = speed > 0 ? vxPxS / speed : 1
  const uy = speed > 0 ? vyPxS / speed : 0
  const dist = distanceToExit(start, ux, uy, vp) + THROW_OVERSHOOT_PX
  const durationMs = clamp(speed > 0 ? (dist / speed) * 1000 : THROW_MAX_MS, THROW_MIN_MS, THROW_MAX_MS)
  const dir = vxPxS === 0 ? 1 : Math.sign(vxPxS)
  const spinDeg = dir * Math.min(THROW_SPIN_MAX, (speed / 1000) * THROW_SPIN_PER_1000)
  return { dx: ux * dist, dy: uy * dist, durationMs, spinDeg }
}
