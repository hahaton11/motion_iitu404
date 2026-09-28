import type { SwipeDir } from '../contracts/input'
import {
  SWIPE_AXIS_RATIO,
  SWIPE_COOLDOWN_MS,
  SWIPE_END_SPEED,
  SWIPE_HINT_MIN,
  SWIPE_MAX_MS,
  SWIPE_MIN_DIST,
  SWIPE_RETURN_MS,
  SWIPE_START_SPEED,
} from './constants'
import type { Vec2 } from './types'

/**
 * Детектор взмахов одной руки. Взмах — быстрое движение, которое началось выше START и закончилось
 * ниже END. Направление решается по главной оси за всё движение. Обратный взмах сразу после взмаха
 * игнорируется: это рука возвращается на место. Если за движение рука сменила захват, это не взмах,
 * а бросок или перенос.
 */

export interface SwipeParams {
  readonly startSpeed: number
  readonly endSpeed: number
  readonly minDist: number
  readonly hintMin: number
  readonly axisRatio: number
  readonly maxMs: number
  readonly returnMs: number
  readonly cooldownMs: number
}

export const DEFAULT_SWIPE: SwipeParams = {
  startSpeed: SWIPE_START_SPEED,
  endSpeed: SWIPE_END_SPEED,
  minDist: SWIPE_MIN_DIST,
  hintMin: SWIPE_HINT_MIN,
  axisRatio: SWIPE_AXIS_RATIO,
  maxMs: SWIPE_MAX_MS,
  returnMs: SWIPE_RETURN_MS,
  cooldownMs: SWIPE_COOLDOWN_MS,
}

interface Stroke {
  readonly start: Vec2
  readonly t0: number
  readonly holding: boolean
  /** Захват изменился во время движения: взмах не засчитывается. */
  readonly spoiled: boolean
}

export interface SwipeState {
  readonly last: { readonly p: Vec2; readonly t: number } | undefined
  readonly stroke: Stroke | undefined
  readonly lastSwipe: { readonly dir: SwipeDir; readonly t: number } | undefined
}

export type SwipeOutcome =
  | { readonly kind: 'swipe'; readonly dir: SwipeDir; readonly holding: boolean }
  | { readonly kind: 'short' }
  | { readonly kind: 'diagonal' }

export interface SwipeFrame {
  readonly t: number
  /** Позиция руки на экране, зеркально, без заморозок курсора. */
  readonly p: Vec2
  readonly holding: boolean
}

export const initialSwipe = (): SwipeState => ({ last: undefined, stroke: undefined, lastSwipe: undefined })

const OPPOSITE: Readonly<Record<SwipeDir, SwipeDir>> = { left: 'right', right: 'left', up: 'down', down: 'up' }

export function directionOf(dx: number, dy: number, ratio: number): SwipeDir | undefined {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax >= ay * ratio) return dx > 0 ? 'right' : 'left'
  if (ay >= ax * ratio) return dy > 0 ? 'down' : 'up'
  return undefined
}

function classify(s: SwipeState, stroke: Stroke, end: Vec2, t: number, p: SwipeParams): SwipeOutcome | undefined {
  if (stroke.spoiled || t - stroke.t0 > p.maxMs) return undefined
  const dx = end.x - stroke.start.x
  const dy = end.y - stroke.start.y
  const dist = Math.hypot(dx, dy)
  if (dist < p.hintMin) return undefined
  if (dist < p.minDist) return { kind: 'short' }
  const dir = directionOf(dx, dy, p.axisRatio)
  if (!dir) return { kind: 'diagonal' }
  const prev = s.lastSwipe
  if (prev && t - prev.t < p.cooldownMs) return undefined
  if (prev && prev.dir === OPPOSITE[dir] && t - prev.t < p.returnMs) return undefined
  return { kind: 'swipe', dir, holding: stroke.holding }
}

export function stepSwipe(
  s: SwipeState,
  f: SwipeFrame,
  p: SwipeParams = DEFAULT_SWIPE,
): { state: SwipeState; outcome: SwipeOutcome | undefined } {
  const last = s.last
  const base: SwipeState = { ...s, last: { p: f.p, t: f.t } }
  if (!last || f.t <= last.t) return { state: base, outcome: undefined }
  const speed = Math.hypot(f.p.x - last.p.x, f.p.y - last.p.y) / ((f.t - last.t) / 1000)
  const stroke = s.stroke
  if (!stroke) {
    if (speed < p.startSpeed) return { state: base, outcome: undefined }
    return { state: { ...base, stroke: { start: last.p, t0: last.t, holding: f.holding, spoiled: false } }, outcome: undefined }
  }
  const spoiled = stroke.spoiled || stroke.holding !== f.holding
  if (speed >= p.endSpeed && f.t - stroke.t0 <= p.maxMs) {
    return { state: { ...base, stroke: { ...stroke, spoiled } }, outcome: undefined }
  }
  const outcome = classify(s, { ...stroke, spoiled }, f.p, f.t, p)
  const lastSwipe = outcome?.kind === 'swipe' ? { dir: outcome.dir, t: f.t } : s.lastSwipe
  return { state: { ...base, stroke: undefined, lastSwipe }, outcome }
}

/** Рука пропала: незавершённое движение сбрасывается. */
export const resetSwipe = (s: SwipeState): SwipeState => ({ ...s, last: undefined, stroke: undefined })
