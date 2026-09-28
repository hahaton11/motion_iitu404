import { containsPoint, toLocal, trianglePoints, type Point } from './geometry'
import type { BoardElement } from './model'

/**
 * Магнитный фокус: вместо точного попадания курсором фокус получает ближайший элемент в радиусе.
 * Текущий фокус удерживается, пока соперник не ближе на заметную величину, поэтому подсветка не мигает.
 */

/** Радиус притяжения и «липкость» текущего фокуса, пиксели экрана. */
export const FOCUS_RADIUS_PX = 80
export const FOCUS_STICKY_PX = 24

function segmentDistance(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)))
  return Math.hypot(p.x - (a.x + abx * k), p.y - (a.y + aby * k))
}

/** Расстояние от точки мира до края фигуры. 0, если точка внутри. */
export function distanceToElement(el: BoardElement, p: Point): number {
  if (containsPoint(el, p)) return 0
  const l = toLocal(el, p)
  const hw = el.w / 2
  const hh = el.h / 2
  switch (el.kind) {
    case 'circle': {
      const r = Math.hypot(l.x / hw, l.y / hh)
      return (r - 1) * Math.min(hw, hh)
    }
    case 'triangle': {
      const pts = trianglePoints(el.w, el.h)
      return Math.min(...pts.map((a, i) => segmentDistance(l, a, pts[(i + 1) % pts.length]!)))
    }
    default:
      return Math.hypot(Math.max(0, Math.abs(l.x) - hw), Math.max(0, Math.abs(l.y) - hh))
  }
}

interface Candidate {
  readonly el: BoardElement
  readonly dist: number
}

const better = (a: Candidate, b: Candidate): boolean => a.dist < b.dist || (a.dist === b.dist && a.el.z > b.el.z)

/**
 * Элемент в фокусе для точки мира. radius и sticky в мировых единицах.
 * currentId — фокус прошлого кадра: он сохраняется, если соперник ближе меньше чем на sticky.
 */
export function focusAt(
  els: readonly BoardElement[],
  p: Point,
  radius: number,
  sticky: number,
  currentId?: string,
): BoardElement | undefined {
  let best: Candidate | undefined
  let current: Candidate | undefined
  for (const el of els) {
    const dist = distanceToElement(el, p)
    if (dist > radius) continue
    const c = { el, dist }
    if (el.id === currentId) current = c
    if (!best || better(c, best)) best = c
  }
  if (current && best && best.dist + sticky >= current.dist && !(best.dist === 0 && current.dist > 0)) return current.el
  return best?.el
}
