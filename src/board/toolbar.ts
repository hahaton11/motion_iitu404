import { screenBounds, type Point, type Viewport } from './geometry'
import type { BoardElement, Camera } from './model'

export type ToolbarAction = 'duplicate' | 'color' | 'delete'

export const TOOLBAR_ACTIONS: readonly ToolbarAction[] = ['duplicate', 'color', 'delete']

export const TOOLBAR_LABELS: Readonly<Record<ToolbarAction, string>> = {
  duplicate: 'Копия',
  color: 'Цвет',
  delete: 'Удалить',
}

/** Кнопки крупные: по ним попадают указательным пальцем с камеры. */
export const TOOLBAR_BUTTON_W = 76
export const TOOLBAR_BUTTON_H = 44
export const TOOLBAR_GAP = 6
export const TOOLBAR_PADDING = 6
export const TOOLBAR_OFFSET = 16
export const TOOLBAR_EDGE = 8

export interface ToolbarButton {
  readonly action: ToolbarAction
  readonly left: number
  readonly top: number
  readonly w: number
  readonly h: number
}

export interface ToolbarLayout {
  readonly left: number
  readonly top: number
  readonly w: number
  readonly h: number
  readonly buttons: readonly ToolbarButton[]
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(lo, v), Math.max(lo, hi))

/** Плашка над выделенным элементом, в пикселях экрана. Если сверху нет места, ставится снизу. */
export function toolbarLayout(el: BoardElement, cam: Camera, vp: Viewport): ToolbarLayout {
  const n = TOOLBAR_ACTIONS.length
  const w = n * TOOLBAR_BUTTON_W + (n - 1) * TOOLBAR_GAP + 2 * TOOLBAR_PADDING
  const h = TOOLBAR_BUTTON_H + 2 * TOOLBAR_PADDING
  const b = screenBounds(el, cam, vp)
  const above = b.top - TOOLBAR_OFFSET - h
  const top = above >= TOOLBAR_EDGE ? above : clamp(b.bottom + TOOLBAR_OFFSET, TOOLBAR_EDGE, vp.h - h - TOOLBAR_EDGE)
  const left = clamp((b.left + b.right) / 2 - w / 2, TOOLBAR_EDGE, vp.w - w - TOOLBAR_EDGE)
  const buttons = TOOLBAR_ACTIONS.map((action, i) => ({
    action,
    left: left + TOOLBAR_PADDING + i * (TOOLBAR_BUTTON_W + TOOLBAR_GAP),
    top: top + TOOLBAR_PADDING,
    w: TOOLBAR_BUTTON_W,
    h: TOOLBAR_BUTTON_H,
  }))
  return { left, top, w, h, buttons }
}

export const insideLayout = (l: ToolbarLayout, p: Point): boolean =>
  p.x >= l.left && p.x <= l.left + l.w && p.y >= l.top && p.y <= l.top + l.h

/** Кнопка под точкой экрана. Промежутки между кнопками отдаются ближайшей. */
export function toolbarHit(l: ToolbarLayout, p: Point): ToolbarAction | undefined {
  if (!insideLayout(l, p)) return undefined
  let best: ToolbarButton | undefined
  let bestDist = Infinity
  for (const b of l.buttons) {
    const d = Math.abs(p.x - (b.left + b.w / 2))
    if (d < bestDist) {
      best = b
      bestDist = d
    }
  }
  return best?.action
}
