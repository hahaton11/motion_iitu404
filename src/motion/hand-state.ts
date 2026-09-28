import { POINT_HOLD_MS, THROW_SPEED } from '../shared/constants'
import { VelocityTracker, speedOf } from '../shared/velocity'
import {
  DEFAULT_HOLD_THRESHOLD,
  DEFAULT_OPEN_THRESHOLD,
  FAST_RELEASE_FRAMES,
  GRAB_FRAMES,
  HAND_LOST_MS,
  POINT_MOVE_MAX,
  RELEASE_FRAMES,
} from './constants'
import type { Thresholds } from './types'

/**
 * Машина состояний одной руки: open → closing → holding → opening → open.
 * closing и opening — подтверждение перехода несколькими кадрами подряд, дебаунс.
 * Между порогами open и hold ничего не переключается, это гистерезис.
 */

export type HandPhase = 'open' | 'closing' | 'holding' | 'opening'

export interface HandFrame {
  readonly t: number
  /** Координаты экрана после фильтра. */
  readonly x: number
  readonly y: number
  readonly closure: number
  readonly indexOnly: boolean
}

interface Velocity {
  readonly vx: number
  readonly vy: number
}

export type HandEvent =
  | { readonly type: 'grab'; readonly x: number; readonly y: number }
  | ({ readonly type: 'release' | 'throw'; readonly x: number; readonly y: number } & Velocity)
  | { readonly type: 'point'; readonly x: number; readonly y: number }
  | { readonly type: 'handlost' }

interface PointTimer {
  readonly since: number
  readonly ax: number
  readonly ay: number
  readonly fired: boolean
}

export interface HandState {
  readonly phase: HandPhase
  /** Сколько кадров подряд держится условие перехода. */
  readonly count: number
  readonly vel: VelocityTracker
  /** Самая большая скорость с начала раскрытия, из неё решается throw. */
  readonly peak: Velocity
  readonly point: PointTimer | undefined
  readonly lastSeen: number | undefined
  readonly x: number
  readonly y: number
}

export interface StepResult {
  readonly state: HandState
  readonly events: readonly HandEvent[]
}

export const DEFAULT_THRESHOLDS: Thresholds = { hold: DEFAULT_HOLD_THRESHOLD, open: DEFAULT_OPEN_THRESHOLD }

const ZERO: Velocity = { vx: 0, vy: 0 }

export const initialHandState = (): HandState => ({
  phase: 'open',
  count: 0,
  vel: VelocityTracker.empty(),
  peak: ZERO,
  point: undefined,
  lastSeen: undefined,
  x: 0.5,
  y: 0.5,
})

export const isHoldingPhase = (p: HandPhase): boolean => p === 'holding' || p === 'opening'
export const handSpeed = (s: HandState): number => speedOf(s.vel.velocity())
export const isPresent = (s: HandState): boolean => s.lastSeen !== undefined

const faster = (a: Velocity, b: Velocity): Velocity => (speedOf(b) > speedOf(a) ? b : a)

function stepPhase(s: HandState, f: HandFrame, th: Thresholds): StepResult {
  const closed = f.closure > th.hold && !f.indexOnly
  const opened = f.closure < th.open
  const v = s.vel.velocity()
  switch (s.phase) {
    case 'open':
    case 'closing': {
      if (!closed) return { state: { ...s, phase: 'open', count: 0 }, events: [] }
      const count = s.count + 1
      if (count < GRAB_FRAMES) return { state: { ...s, phase: 'closing', count }, events: [] }
      return { state: { ...s, phase: 'holding', count: 0, point: undefined }, events: [{ type: 'grab', x: f.x, y: f.y }] }
    }
    case 'holding':
    case 'opening': {
      if (!opened) return { state: { ...s, phase: 'holding', count: 0 }, events: [] }
      const count = s.count + 1
      const peak = s.phase === 'opening' ? faster(s.peak, v) : v
      // Подтверждение отпускания короче, когда рука уже летит: бросок длится доли секунды,
      // и три кадра подтверждения поверх окна голосования в него не помещаются.
      // Промах в сторону раннего отпускания стоит недолёта, промах в сторону позднего — броска целиком.
      const need = speedOf(peak) > THROW_SPEED ? FAST_RELEASE_FRAMES : RELEASE_FRAMES
      if (count < need) return { state: { ...s, phase: 'opening', count, peak }, events: [] }
      const type = speedOf(peak) > THROW_SPEED ? 'throw' : 'release'
      return { state: { ...s, phase: 'open', count: 0, peak: ZERO }, events: [{ type, x: f.x, y: f.y, ...peak }] }
    }
  }
}

function stepPoint(s: HandState, f: HandFrame): StepResult {
  if (s.phase !== 'open' || !f.indexOnly) return { state: { ...s, point: undefined }, events: [] }
  const p = s.point
  const moved = p ? Math.hypot(f.x - p.ax, f.y - p.ay) > POINT_MOVE_MAX : true
  if (!p || moved) return { state: { ...s, point: { since: f.t, ax: f.x, ay: f.y, fired: false } }, events: [] }
  if (p.fired || f.t - p.since < POINT_HOLD_MS) return { state: s, events: [] }
  return { state: { ...s, point: { ...p, fired: true } }, events: [{ type: 'point', x: f.x, y: f.y }] }
}

/** Шаг по кадру, в котором рука видна. */
export function stepHand(s: HandState, f: HandFrame, th: Thresholds = DEFAULT_THRESHOLDS): StepResult {
  const seen: HandState = { ...s, vel: s.vel.push(f.x, f.y, f.t), lastSeen: f.t, x: f.x, y: f.y }
  const a = stepPhase(seen, f, th)
  const b = stepPoint(a.state, f)
  return { state: b.state, events: [...a.events, ...b.events] }
}

/**
 * Шаг по кадру, в котором руки нет. После HAND_LOST_MS шлёт handlost, а если рука держала
 * элемент — перед этим отпускание с той скоростью, с которой рука пропала.
 *
 * Скорость здесь важна. Рука теряется как раз на резком махе: детектор не успевает за
 * смазанным кадром. С нулевой скоростью бросок превращался в вялое падение на месте —
 * пользователь махнул, а элемент просто лёг под руку.
 */
export function stepHandMissing(s: HandState, t: number): StepResult {
  if (s.lastSeen === undefined || t - s.lastSeen < HAND_LOST_MS) return { state: s, events: [] }
  const events: HandEvent[] = []
  if (isHoldingPhase(s.phase)) {
    const peak = faster(s.peak, s.vel.velocity())
    const type = speedOf(peak) > THROW_SPEED ? 'throw' : 'release'
    events.push({ type, x: s.x, y: s.y, ...peak })
  }
  return { state: initialHandState(), events: [...events, { type: 'handlost' }] }
}
