import type { SwipeDir } from '../contracts/input'

/**
 * Пространственная навигация, как на пульте телевизора: из текущей точки взмах ведёт к ближайшей
 * цели в этом направлении. Цели и точки в долях экрана. Чистая логика без DOM.
 */

export interface NavPoint {
  readonly x: number
  readonly y: number
}

export interface NavTarget extends NavPoint {
  readonly id: string
}

/** Цель должна быть впереди хотя бы на столько, иначе это та же колонка или строка. */
export const NAV_MIN_AHEAD = 0.02
/** Боковое смещение штрафуется сильнее продольного: сосед по прямой важнее соседа по диагонали. */
export const NAV_SIDE_WEIGHT = 2.5
/** Цель вне конуса ±68° от направления не рассматривается. */
export const NAV_CONE = 2.5

const AXIS: Readonly<Record<SwipeDir, { readonly ax: 'x' | 'y'; readonly sign: 1 | -1 }>> = {
  right: { ax: 'x', sign: 1 },
  left: { ax: 'x', sign: -1 },
  down: { ax: 'y', sign: 1 },
  up: { ax: 'y', sign: -1 },
}

function score(from: NavPoint, t: NavPoint, dir: SwipeDir): number | undefined {
  const { ax, sign } = AXIS[dir]
  const side = ax === 'x' ? 'y' : 'x'
  const ahead = (t[ax] - from[ax]) * sign
  const offset = Math.abs(t[side] - from[side])
  if (ahead < NAV_MIN_AHEAD || offset > ahead * NAV_CONE) return undefined
  return ahead + offset * NAV_SIDE_WEIGHT
}

/** Ближайшая цель в направлении взмаха. excludeId — текущая цель, её пропускаем. */
export function nextInDirection<T extends NavTarget>(
  from: NavPoint,
  dir: SwipeDir,
  targets: readonly T[],
  excludeId?: string,
): T | undefined {
  let best: { t: T; s: number } | undefined
  for (const t of targets) {
    if (t.id === excludeId) continue
    const s = score(from, t, dir)
    if (s !== undefined && (!best || s < best.s)) best = { t, s }
  }
  return best?.t
}

export function nearest<T extends NavPoint>(p: NavPoint, targets: readonly T[]): T | undefined {
  let best: { t: T; d: number } | undefined
  for (const t of targets) {
    const d = Math.hypot(t.x - p.x, t.y - p.y)
    if (!best || d < best.d) best = { t, d }
  }
  return best?.t
}

/** Шаг переноса элемента, когда в направлении нет точки привязки. */
export const NAV_STEP = 0.18
/** Элемент при шаге не уходит ближе этого к краю экрана. */
export const NAV_MARGIN = 0.08

export function stepPoint(from: NavPoint, dir: SwipeDir, step = NAV_STEP, margin = NAV_MARGIN): NavPoint {
  const { ax, sign } = AXIS[dir]
  const v = Math.min(1 - margin, Math.max(margin, from[ax] + sign * step))
  return ax === 'x' ? { x: v, y: from.y } : { x: from.x, y: v }
}
