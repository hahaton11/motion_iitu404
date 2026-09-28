import type { BoardElement, Camera } from './model'

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Viewport {
  readonly w: number
  readonly h: number
}

export interface Rect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

const DEG = Math.PI / 180

export const normToScreen = (vp: Viewport, nx: number, ny: number): Point => ({ x: nx * vp.w, y: ny * vp.h })

export const worldToScreen = (cam: Camera, vp: Viewport, p: Point): Point => ({
  x: (p.x - cam.x) * cam.zoom + vp.w / 2,
  y: (p.y - cam.y) * cam.zoom + vp.h / 2,
})

export const screenToWorld = (cam: Camera, vp: Viewport, p: Point): Point => ({
  x: (p.x - vp.w / 2) / cam.zoom + cam.x,
  y: (p.y - vp.h / 2) / cam.zoom + cam.y,
})

/** Точка мира в системе элемента: начало в центре, оси повёрнуты вместе с элементом. */
export function toLocal(el: BoardElement, p: Point): Point {
  const a = -el.rotation * DEG
  const dx = p.x - el.x
  const dy = p.y - el.y
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }
}

const inBox = (p: Point, hw: number, hh: number): boolean => Math.abs(p.x) <= hw && Math.abs(p.y) <= hh

function inEllipse(p: Point, rx: number, ry: number): boolean {
  return (p.x / rx) ** 2 + (p.y / ry) ** 2 <= 1
}

/** Выпуклый многоугольник по часовой стрелке (ось y вниз), pad расширяет каждую сторону. */
function inConvex(p: Point, pts: readonly Point[], pad: number): boolean {
  return pts.every((a, i) => {
    const b = pts[(i + 1) % pts.length] ?? a
    const ex = b.x - a.x
    const ey = b.y - a.y
    const dist = (ex * (p.y - a.y) - ey * (p.x - a.x)) / Math.hypot(ex, ey)
    return dist >= -pad
  })
}

/** Равнобедренный треугольник: вершина сверху по центру, основание снизу. */
export function trianglePoints(w: number, h: number): readonly Point[] {
  return [
    { x: 0, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ]
}

/** Попадание точки мира в фигуру с учётом поворота. pad в мировых единицах. */
export function containsPoint(el: BoardElement, p: Point, pad = 0): boolean {
  const local = toLocal(el, p)
  const hw = el.w / 2 + pad
  const hh = el.h / 2 + pad
  switch (el.kind) {
    case 'circle':
      return inEllipse(local, hw, hh)
    case 'triangle':
      return inConvex(local, trianglePoints(el.w, el.h), pad)
    default:
      return inBox(local, hw, hh)
  }
}

export const sortByZ = (els: readonly BoardElement[]): readonly BoardElement[] => [...els].sort((a, b) => a.z - b.z)

/** Верхний по z элемент под точкой мира. */
export function hitTest(els: readonly BoardElement[], p: Point, pad = 0): BoardElement | undefined {
  let best: BoardElement | undefined
  for (const el of els) {
    if ((!best || el.z > best.z) && containsPoint(el, p, pad)) best = el
  }
  return best
}

/** Экранный прямоугольник, описанный вокруг повёрнутого элемента. */
export function screenBounds(el: BoardElement, cam: Camera, vp: Viewport): Rect {
  const a = el.rotation * DEG
  const hw = (Math.abs(Math.cos(a)) * el.w + Math.abs(Math.sin(a)) * el.h) / 2
  const hh = (Math.abs(Math.sin(a)) * el.w + Math.abs(Math.cos(a)) * el.h) / 2
  const c = worldToScreen(cam, vp, el)
  return { left: c.x - hw * cam.zoom, right: c.x + hw * cam.zoom, top: c.y - hh * cam.zoom, bottom: c.y + hh * cam.zoom }
}

/** Точка мира, прижатая внутрь видимой области. margin в пикселях экрана. */
export function clampToView(cam: Camera, vp: Viewport, p: Point, margin: number): Point {
  const s = worldToScreen(cam, vp, p)
  const x = Math.min(vp.w - margin, Math.max(margin, s.x))
  const y = Math.min(vp.h - margin, Math.max(margin, s.y))
  return x === s.x && y === s.y ? p : screenToWorld(cam, vp, { x, y })
}
