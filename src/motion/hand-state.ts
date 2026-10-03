import { POINT_HOLD_MS, PUT_WINDOW_MS, THROW_MEMORY_MS, THROW_SPEED } from '../shared/constants'
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
 * Машина состояний одной руки.
 *
 *   open → closing → holding ⇄ opening → open                  кулак на пустом месте: раскрыл — отпустил
 *                       ↓ потребитель взял элемент (carry)
 *                    holding → carrying → clicking → open       несёт элемент, щелчок кулак → ладонь кладёт
 *
 * closing, opening и счётчики в carrying и clicking — подтверждение перехода несколькими кадрами
 * подряд, дебаунс. Между порогами open и hold ничего не переключается, это гистерезис.
 *
 * Захват прилипает, только когда потребитель подтвердил, что в руке элемент (`setCarry`): машина
 * не знает, что лежит под курсором. Без подтверждения кулак ведёт себя по-старому, и раскрытая
 * ладонь его отпускает: так работает кулак на пустом месте, нужный зуму двумя руками.
 */

export type HandPhase = 'open' | 'closing' | 'holding' | 'opening' | 'carrying' | 'clicking'

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
  /** Потребитель держит в этой руке элемент: захват прилипает, раскрытая ладонь его не отпускает. */
  readonly carry: boolean
  /** carrying: первый кадр кулака, который ещё подтверждается. clicking: когда кулак сжался. */
  readonly fistAt: number | undefined
  /** clicking: первый кадр раскрытой ладони, которая ещё подтверждается. */
  readonly openAt: number | undefined
  /** Когда рука с элементом махнула без кулака: для подсказки, как выбросить. */
  readonly swingAt: number | undefined
  /** Когда медленный щелчок на ходу положил элемент вместо броска: для подсказки. */
  readonly slowThrowAt: number | undefined
  readonly vel: VelocityTracker
  /** Самая большая скорость за последние THROW_MEMORY_MS, из неё решается throw. */
  readonly peak: Velocity
  /** Когда снят peak. Показание старше THROW_MEMORY_MS не считается: мах кончился. */
  readonly peakAt: number
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
  carry: false,
  fistAt: undefined,
  openAt: undefined,
  swingAt: undefined,
  slowThrowAt: undefined,
  vel: VelocityTracker.empty(),
  peak: ZERO,
  peakAt: -Infinity,
  point: undefined,
  lastSeen: undefined,
  x: 0.5,
  y: 0.5,
})

/** Рука держит что-то: кулак после захвата или несомый элемент в любой позе. */
export const isHoldingPhase = (p: HandPhase): boolean => p !== 'open' && p !== 'closing'
/** Кулак после захвата, ещё не раскрытый. */
export const isFistPhase = (p: HandPhase): boolean => p === 'holding' || p === 'opening'
export const handSpeed = (s: HandState): number => speedOf(s.vel.velocity())
export const isPresent = (s: HandState): boolean => s.lastSeen !== undefined

const faster = (a: Velocity, b: Velocity): Velocity => (speedOf(b) > speedOf(a) ? b : a)
const isFast = (v: Velocity): boolean => speedOf(v) > THROW_SPEED

/** Запомненный мах, если он ещё не истёк к моменту `at`. */
const freshPeak = (s: HandState, at: number): Velocity => (at - s.peakAt <= THROW_MEMORY_MS ? s.peak : ZERO)

/**
 * Самая быстрая скорость за окно THROW_MEMORY_MS. Считается на каждом кадре, а не с начала раскрытия:
 * поза раскрытия приходит от классификатора уже после конца маха, и к тому кадру скорость нулевая.
 */
function rememberPeak(s: HandState, t: number): HandState {
  const v = s.vel.velocity()
  const fresh = freshPeak(s, t)
  return speedOf(v) > speedOf(fresh) ? { ...s, peak: v, peakAt: t } : { ...s, peak: fresh }
}

/**
 * Потребитель сообщает, держит ли рука элемент. true — захват прилипает. false — элемент забрали
 * без жеста (карман, удаление): рука свободна без release. Если кулак ещё сжат, рука остаётся
 * в holding без прилипания, иначе тот же кулак тут же взял бы что-нибудь снова.
 */
export function setCarry(s: HandState, carry: boolean): HandState {
  if (carry) {
    if (s.carry && isHoldingPhase(s.phase)) return s
    const phase = isHoldingPhase(s.phase) ? s.phase : 'carrying'
    return { ...s, carry: true, phase, count: phase === s.phase ? s.count : 0, fistAt: undefined, openAt: undefined }
  }
  if (!s.carry) return s
  const fist = s.phase === 'holding' || s.phase === 'opening' || s.phase === 'clicking'
  const free = { ...s, carry: false, count: 0, fistAt: undefined, openAt: undefined }
  return fist ? { ...free, phase: 'holding' } : { ...free, phase: 'open' }
}

function stepFree(s: HandState, f: HandFrame, closed: boolean): StepResult {
  if (!closed) return { state: { ...s, phase: 'open', count: 0 }, events: [] }
  const count = s.count + 1
  if (count < GRAB_FRAMES) return { state: { ...s, phase: 'closing', count }, events: [] }
  // Мах, которым рука дотянулась до элемента, броском не считается: окно начинается с захвата.
  return {
    state: { ...s, phase: 'holding', count: 0, carry: false, point: undefined, peak: ZERO, peakAt: -Infinity },
    events: [{ type: 'grab', x: f.x, y: f.y }],
  }
}

/** Кулак после захвата. Без carry раскрытие отпускает, с carry — рука просто несёт элемент дальше. */
function stepFist(s: HandState, f: HandFrame, opened: boolean): StepResult {
  if (!opened) return { state: { ...s, phase: 'holding', count: 0 }, events: [] }
  const count = s.count + 1
  // peak уже посчитан rememberPeak по окну THROW_MEMORY_MS: мах мог кончиться кадров пять назад,
  // пока голосователь набирал большинство за раскрытую ладонь.
  const peak = s.peak
  // Подтверждение отпускания короче, когда рука уже летит: бросок длится доли секунды,
  // и три кадра подтверждения поверх окна голосования в него не помещаются.
  const need = isFast(peak) ? FAST_RELEASE_FRAMES : RELEASE_FRAMES
  if (count < need) return { state: { ...s, phase: 'opening', count }, events: [] }
  if (s.carry) {
    // Захват раскрыт на махе — по старой привычке так бросали. Теперь это не бросок, а повод подсказать.
    const swingAt = isFast(peak) ? f.t : s.swingAt
    return { state: { ...s, phase: 'carrying', count: 0, swingAt }, events: [] }
  }
  const type = isFast(peak) ? 'throw' : 'release'
  return { state: { ...s, phase: 'open', count: 0, peak: ZERO, peakAt: -Infinity }, events: [{ type, x: f.x, y: f.y, ...peak }] }
}

/** Несёт элемент в любой позе, кроме кулака. Кулак, продержавшийся GRAB_FRAMES, взводит щелчок. */
function stepCarrying(s: HandState, f: HandFrame, closed: boolean): StepResult {
  const swingAt = isFast(s.vel.velocity()) ? f.t : s.swingAt
  if (!closed) return { state: { ...s, count: 0, fistAt: undefined, swingAt }, events: [] }
  const fistAt = s.fistAt ?? f.t
  const count = s.count + 1
  if (count < GRAB_FRAMES) return { state: { ...s, count, fistAt, swingAt }, events: [] }
  return { state: { ...s, phase: 'clicking', count: 0, fistAt, openAt: undefined, swingAt }, events: [] }
}

/**
 * Кулак с элементом в руке. Раскрытие ладони кладёт элемент. В пределах PUT_WINDOW_MS от кулака
 * щелчок на месте — release, на ходу — throw. Дольше окна — всегда release: удалять может только
 * быстрый щелчок, а мах на долгом кулаке отмечается для подсказки.
 */
function stepClicking(s: HandState, f: HandFrame, opened: boolean): StepResult {
  if (!opened) return { state: { ...s, count: 0, openAt: undefined }, events: [] }
  const openAt = s.openAt ?? f.t
  const count = s.count + 1
  const peak = s.peak
  const need = isFast(peak) ? FAST_RELEASE_FRAMES : RELEASE_FRAMES
  if (count < need) return { state: { ...s, count, openAt }, events: [] }
  const inWindow = openAt - (s.fistAt ?? openAt) <= PUT_WINDOW_MS
  const type = inWindow && isFast(peak) ? 'throw' : 'release'
  const slowThrowAt = !inWindow && isFast(peak) ? f.t : s.slowThrowAt
  const state: HandState = {
    ...s,
    phase: 'open',
    count: 0,
    carry: false,
    fistAt: undefined,
    openAt: undefined,
    slowThrowAt,
    peak: ZERO,
    peakAt: -Infinity,
  }
  return { state, events: [{ type, x: f.x, y: f.y, ...peak }] }
}

function stepPhase(s: HandState, f: HandFrame, th: Thresholds): StepResult {
  const closed = f.closure > th.hold && !f.indexOnly
  const opened = f.closure < th.open
  switch (s.phase) {
    case 'open':
    case 'closing':
      return stepFree(s, f, closed)
    case 'holding':
    case 'opening':
      return stepFist(s, f, opened)
    case 'carrying':
      return stepCarrying(s, f, closed)
    case 'clicking':
      return stepClicking(s, f, opened)
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
  const a = stepPhase(rememberPeak(seen, f.t), f, th)
  const b = stepPoint(a.state, f)
  return { state: b.state, events: [...a.events, ...b.events] }
}

/**
 * Чем кончается удержание, когда рука пропала. Несомый элемент падает на месте: пропажа руки —
 * не жест, и удалять по ней нельзя. Исключение — щелчок, взведённый в окне PUT_WINDOW_MS: рука
 * теряется как раз на резком махе, детектор не успевает за смазанным кадром, и такой щелчок
 * доводится до броска. Кулак без элемента ведёт себя как раньше: release или throw по скорости.
 *
 * Свежесть маха мерится по последнему кадру, где рука была видна, а не по `t`: вопрос в том,
 * летела ли рука в момент, когда пропала, а не насколько поздно пришёл этот вызов.
 */
function lostDrop(s: HandState, lastSeen: number): HandEvent {
  const peak = faster(freshPeak(s, lastSeen), s.vel.velocity())
  const at = { x: s.x, y: s.y }
  if (!s.carry) return { type: isFast(peak) ? 'throw' : 'release', ...at, ...peak }
  const clickInWindow = s.phase === 'clicking' && s.fistAt !== undefined && lastSeen - s.fistAt <= PUT_WINDOW_MS
  return clickInWindow && isFast(peak) ? { type: 'throw', ...at, ...peak } : { type: 'release', ...at, ...ZERO }
}

/** Шаг по кадру, в котором руки нет. После HAND_LOST_MS шлёт handlost, перед ним — конец удержания. */
export function stepHandMissing(s: HandState, t: number): StepResult {
  if (s.lastSeen === undefined || t - s.lastSeen < HAND_LOST_MS) return { state: s, events: [] }
  const drop = isHoldingPhase(s.phase) ? [lostDrop(s, s.lastSeen)] : []
  return { state: initialHandState(), events: [...drop, { type: 'handlost' }] }
}
