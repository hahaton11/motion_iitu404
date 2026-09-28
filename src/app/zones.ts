/** Прямоугольные зоны в мировых координатах доски: рамки обучения, кластеры и корзина челленджа. */

export interface WorldRect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface WorldPoint {
  readonly x: number
  readonly y: number
}

/** Что нужно знать об элементе для проверки: центр и размер. */
export interface Placed {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export const rect = (left: number, top: number, right: number, bottom: number): WorldRect => ({ left, top, right, bottom })

export const containsPoint = (r: WorldRect, p: WorldPoint): boolean =>
  p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom

/** Элемент лежит в зоне, если внутри его центр. */
export const centerIn = (r: WorldRect, el: Placed): boolean => containsPoint(r, el)

/** Элемент задевает зону краем, но центр снаружи: рука чуть не донесла. */
export function touchesEdge(r: WorldRect, el: Placed): boolean {
  if (centerIn(r, el)) return false
  const hw = el.w / 2
  const hh = el.h / 2
  return el.x + hw > r.left && el.x - hw < r.right && el.y + hh > r.top && el.y - hh < r.bottom
}

export const rectWidth = (r: WorldRect): number => r.right - r.left
export const rectHeight = (r: WorldRect): number => r.bottom - r.top
