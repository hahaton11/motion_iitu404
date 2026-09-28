import {
  POINTER_BOX,
  POINTER_FREE_FILTER,
  POINTER_FREEZE_MAX_MS,
  POINTER_HOLD_FILTER,
  POINTER_LEASH_FREE,
  POINTER_LEASH_HOLD,
  POINTER_OFFSET_BLEED,
} from './constants'
import { oneEuro2DStep, oneEuro2DValue, type OneEuro2DState, type OneEuroParams } from './one-euro'
import type { Vec2 } from './types'

/**
 * Курсор руки: рабочая зона кадра → экран, фильтр по режиму, поводок против микродрожи,
 * заморозка на время сжатия и разжатия кулака, чтобы курсор не прыгал в момент захвата.
 */

export interface PointerBox {
  readonly cx: number
  readonly cy: number
  readonly w: number
  readonly h: number
}

export interface PointerParams {
  readonly box: PointerBox
  readonly freeFilter: OneEuroParams
  readonly holdFilter: OneEuroParams
  readonly leashFree: number
  readonly leashHold: number
  readonly freezeMaxMs: number
  readonly offsetBleed: number
}

export const DEFAULT_POINTER: PointerParams = {
  box: POINTER_BOX,
  freeFilter: POINTER_FREE_FILTER,
  holdFilter: POINTER_HOLD_FILTER,
  leashFree: POINTER_LEASH_FREE,
  leashHold: POINTER_LEASH_HOLD,
  freezeMaxMs: POINTER_FREEZE_MAX_MS,
  offsetBleed: POINTER_OFFSET_BLEED,
}

export interface PointerState {
  readonly filter: OneEuro2DState | undefined
  readonly out: Vec2 | undefined
  readonly lastMapped: Vec2 | undefined
  /** Сдвиг, накопленный после заморозок, гасится по мере движения руки. */
  readonly offset: Vec2
  readonly freeze: { readonly since: number; readonly mapped: Vec2 } | undefined
  /** Заморозка уже отработала в текущем переходе, повторно не включается до его конца. */
  readonly freezeSpent: boolean
}

export interface PointerContext {
  readonly holding: boolean
  /** Кулак в промежутке между порогами: сжимается или разжимается. */
  readonly transitioning: boolean
  /** Рука в бездействии: курсор стоит, сколько угодно долго, и продолжает без скачка. */
  readonly paused?: boolean
}

export const initialPointer = (): PointerState => ({
  filter: undefined,
  out: undefined,
  lastMapped: undefined,
  offset: { x: 0, y: 0 },
  freeze: undefined,
  freezeSpent: false,
})

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k })
const len = (a: Vec2): number => Math.hypot(a.x, a.y)

/** Точка кадра, не зеркальная → экран: зеркальный x, рабочая зона растягивается на весь экран. */
export function boxToScreen(p: Vec2, box: PointerBox = POINTER_BOX): Vec2 {
  const left = Math.min(1 - box.w, Math.max(0, box.cx - box.w / 2))
  const top = Math.min(1 - box.h, Math.max(0, box.cy - box.h / 2))
  return { x: clamp01((1 - p.x - left) / box.w), y: clamp01((p.y - top) / box.h) }
}

/** Рабочая зона с центром в точке кадра, например там, где рука лежала при калибровке. */
export function boxAround(center: Vec2, base: PointerBox = POINTER_BOX): PointerBox {
  return { ...base, cx: 1 - center.x, cy: center.y }
}

/** Поводок: out догоняет target, только если тот дальше радиуса. */
export function leash(out: Vec2 | undefined, target: Vec2, radius: number): Vec2 {
  if (!out) return target
  const d = sub(target, out)
  const dist = len(d)
  return dist <= radius ? out : add(out, scale(d, 1 - radius / dist))
}

function bleed(offset: Vec2, moved: number, k: number): Vec2 {
  return scale(offset, Math.max(0, 1 - moved * k))
}

/** Выход из заморозки: смещение подбирается так, чтобы курсор не прыгнул. */
function thaw(s: PointerState, mapped: Vec2): Vec2 {
  return s.freeze ? add(s.offset, sub(s.freeze.mapped, mapped)) : s.offset
}

export function stepPointer(
  s: PointerState,
  raw: Vec2,
  t: number,
  ctx: PointerContext,
  p: PointerParams = DEFAULT_POINTER,
): { state: PointerState; screen: Vec2 } {
  const mapped = boxToScreen(raw, p.box)
  const withinFreeze = !s.freeze || t - s.freeze.since < p.freezeMaxMs
  const transitionFreeze = ctx.transitioning && !s.freezeSpent && withinFreeze
  if ((ctx.paused || transitionFreeze) && s.out) {
    // Точка отсчёта — последний кадр до заморозки, иначе сдвиг первого кадра перехода потеряется.
    const freeze = s.freeze ?? { since: t, mapped: s.lastMapped ?? mapped }
    return { state: { ...s, freeze, lastMapped: mapped }, screen: s.out }
  }
  const moved = s.lastMapped ? len(sub(mapped, s.lastMapped)) : 0
  const offset = bleed(thaw(s, mapped), moved, p.offsetBleed)
  const target = add(mapped, offset)
  const filterParams = ctx.holding ? p.holdFilter : p.freeFilter
  const filter = oneEuro2DStep(s.filter, target, t, filterParams)
  const smooth = oneEuro2DValue(filter)
  const leashed = leash(s.out, smooth, ctx.holding ? p.leashHold : p.leashFree)
  const out = { x: clamp01(leashed.x), y: clamp01(leashed.y) }
  const freezeSpent = ctx.transitioning && (s.freezeSpent || s.freeze !== undefined)
  return { state: { filter, out, lastMapped: mapped, offset, freeze: undefined, freezeSpent }, screen: out }
}
