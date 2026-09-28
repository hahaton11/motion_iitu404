import {
  POINTER_FREE_FILTER,
  POINTER_FREEZE_MAX_MS,
  POINTER_GAIN_MAX,
  POINTER_GAIN_MIN,
  POINTER_GAIN_SPEED,
  POINTER_HOLD_FILTER,
  POINTER_LEASH_FREE,
  POINTER_LEASH_HOLD,
} from './constants'
import { oneEuro2DStep, oneEuro2DValue, type OneEuro2DState, type OneEuroParams } from './one-euro'
import type { Vec2 } from './types'

/**
 * Воздушный трекпад. Курсор сдвигается на смещение руки, только пока включён сцеп:
 * вытянут указательный или идёт щипок. Без сцепа рука свободна, курсор стоит на месте,
 * поэтому руку можно держать где удобно, например у груди, и она не закрывает экран.
 * Усиление зависит от скорости, как ускорение мыши. Пока щипок смыкается, курсор заморожен.
 */

export interface PointerParams {
  readonly gainMin: number
  readonly gainMax: number
  /** Скорость руки в долях кадра в секунду, на которой усиление достигает максимума. */
  readonly gainSpeed: number
  readonly freeFilter: OneEuroParams
  readonly holdFilter: OneEuroParams
  readonly leashFree: number
  readonly leashHold: number
  readonly freezeMaxMs: number
}

export const DEFAULT_POINTER: PointerParams = {
  gainMin: POINTER_GAIN_MIN,
  gainMax: POINTER_GAIN_MAX,
  gainSpeed: POINTER_GAIN_SPEED,
  freeFilter: POINTER_FREE_FILTER,
  holdFilter: POINTER_HOLD_FILTER,
  leashFree: POINTER_LEASH_FREE,
  leashHold: POINTER_LEASH_HOLD,
  freezeMaxMs: POINTER_FREEZE_MAX_MS,
}

export interface PointerState {
  readonly filter: OneEuro2DState | undefined
  /** Сглаженная позиция руки в прошлом кадре, зеркальная, доли кадра. */
  readonly hand: Vec2 | undefined
  readonly t: number | undefined
  /** Куда ведёт рука, до поводка. */
  readonly target: Vec2
  /** Что видит пользователь. */
  readonly out: Vec2
  readonly freezeSince: number | undefined
  /** Заморозка уже отработала в текущем переходе. */
  readonly freezeSpent: boolean
  /** Сцеп был включён в прошлом кадре: движение считается только между двумя сцепленными кадрами. */
  readonly engaged: boolean
}

export interface PointerContext {
  /** Сцеп включён: рука ведёт курсор. */
  readonly engaged: boolean
  readonly holding: boolean
  /** Щипок между порогами: смыкается или размыкается. */
  readonly transitioning: boolean
}

const CENTER: Vec2 = { x: 0.5, y: 0.5 }

export const initialPointer = (start: Vec2 = CENTER): PointerState => ({
  filter: undefined,
  hand: undefined,
  t: undefined,
  target: start,
  out: start,
  freezeSince: undefined,
  freezeSpent: false,
  engaged: false,
})

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const clampPoint = (p: Vec2): Vec2 => ({ x: clamp01(p.x), y: clamp01(p.y) })
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k })

/** Поводок: out догоняет target, только если тот дальше радиуса. */
export function leash(out: Vec2, target: Vec2, radius: number): Vec2 {
  const d = sub(target, out)
  const dist = Math.hypot(d.x, d.y)
  return dist <= radius ? out : add(out, scale(d, 1 - radius / dist))
}

/** Усиление по скорости: плавно от gainMin до gainMax. */
export function gainFor(speed: number, p: PointerParams = DEFAULT_POINTER): number {
  const k = clamp01(speed / p.gainSpeed)
  const eased = k * k * (3 - 2 * k)
  return p.gainMin + (p.gainMax - p.gainMin) * eased
}

function freezeNow(s: PointerState, ctx: PointerContext, t: number, p: PointerParams): boolean {
  if (!ctx.transitioning || s.freezeSpent) return false
  return s.freezeSince === undefined || t - s.freezeSince < p.freezeMaxMs
}

/** raw — центр ладони в кадре, не зеркальный. */
export function stepPointer(
  s: PointerState,
  raw: Vec2,
  t: number,
  ctx: PointerContext,
  p: PointerParams = DEFAULT_POINTER,
): { state: PointerState; screen: Vec2 } {
  const filter = oneEuro2DStep(s.filter, { x: 1 - raw.x, y: raw.y }, t, ctx.holding ? p.holdFilter : p.freeFilter)
  const hand = oneEuro2DValue(filter)
  const frozen = freezeNow(s, ctx, t, p)
  const base = { ...s, filter, hand, t, engaged: ctx.engaged }
  if (frozen) return { state: { ...base, freezeSince: s.freezeSince ?? t }, screen: s.out }
  const freezeSpent = ctx.transitioning && (s.freezeSpent || s.freezeSince !== undefined)
  const moved = s.hand && s.t !== undefined && ctx.engaged && s.engaged ? sub(hand, s.hand) : undefined
  const dt = s.t !== undefined ? Math.max(1, t - s.t) / 1000 : 1
  const speed = moved ? Math.hypot(moved.x, moved.y) / dt : 0
  const target = moved ? clampPoint(add(s.target, scale(moved, gainFor(speed, p)))) : s.target
  const radius = ctx.holding ? p.leashHold : p.leashFree
  // У края экрана поводок не должен мешать дойти до самого края.
  const atEdge = target.x <= 0 || target.x >= 1 || target.y <= 0 || target.y >= 1
  const out = clampPoint(atEdge ? target : leash(s.out, target, radius))
  return { state: { ...base, target, out, freezeSince: undefined, freezeSpent }, screen: out }
}
