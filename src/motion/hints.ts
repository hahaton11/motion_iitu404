import type { HandId, HintEvt, MotionHintCode } from '../contracts/input'
import {
  EDGE_HINT_MARGIN,
  GEOMETRY_HINT_MS,
  HALF_GESTURE_MS,
  NEAR_PAN_HINT_MS,
  NEAR_PINCH_HINT_MS,
  CARRY_OPEN_HINT_MS,
  CARRY_FLASH_MS,
  CARRY_NAV_HINT_MS,
  HINT_CLEAR_MS,
  HINT_COOLDOWN_MS,
  HINT_GAP_MS,
  NO_HAND_MS,
  PALM_SIZE_MAX,
  PALM_SIZE_MIN,
  POOR_TRACKING_MS,
  POOR_TRACKING_SCORE,
} from './constants'
import { isFistPhase, isHoldingPhase, type HandPhase } from './hand-state'
import { edgeDistance } from './landmarks'
import type { Thresholds, Vec2 } from './types'

/** Детектор подсказок режима «ошибка»: условие должно продержаться, один код не чаще раза в 3 секунды. */

/**
 * Подсказки переноса прилипшего элемента. Коды свои, не из контракта: поле `code` подсказки
 * принимает любую строку, а контракт без нужды не меняется.
 */
export type CarryHintCode = 'CARRY_PUT_HOW' | 'CARRY_THROW_HOW' | 'CARRY_THROW_SLOW' | 'CARRY_NAV_BUSY'

type HintCode = MotionHintCode | CarryHintCode

export const HINT_TEXTS: Readonly<Record<HintCode, Pick<HintEvt, 'message' | 'severity'>>> = {
  CARRY_PUT_HOW: { message: 'Чтобы положить, сожми кулак и быстро раскрой ладонь', severity: 'info' },
  CARRY_THROW_HOW: { message: 'Чтобы выбросить, сожми кулак и раскрой ладонь на ходу', severity: 'info' },
  CARRY_THROW_SLOW: { message: 'Чтобы выбросить, раскрой ладонь сразу после кулака, не задерживая его', severity: 'warn' },
  CARRY_NAV_BUSY: { message: 'Сначала положи элемент щелчком кулак → ладонь, потом двигай доску', severity: 'info' },
  HALF_GRAB: { message: 'Сожми кулак полностью, чтобы взять', severity: 'warn' },
  HALF_RELEASE: { message: 'Раскрой ладонь шире, чтобы отпустить', severity: 'warn' },
  HALF_PAN: { message: 'Выпрями указательный и средний, остальные согни', severity: 'warn' },
  HALF_PINCH: { message: 'Сомкни кончики большого и указательного, остальные пальцы согни', severity: 'warn' },
  HAND_NEAR_EDGE: { message: 'Рука у края кадра, веди её ближе к центру', severity: 'info' },
  TOO_FAR: { message: 'Подойди на шаг ближе к камере', severity: 'info' },
  TOO_CLOSE: { message: 'Отойди на шаг назад, рука не помещается в кадр', severity: 'info' },
  MOVING_TOO_FAST: { message: 'Двигай рукой чуть медленнее, камера не успевает', severity: 'warn' },
  POOR_TRACKING: { message: 'Мало света, повернись к источнику света', severity: 'info' },
  SWIPE_SHORT: { message: 'Махни шире, примерно на полруки, чтобы перейти', severity: 'info' },
  SWIPE_DIAGONAL: { message: 'Махни строго вбок или строго вверх-вниз', severity: 'info' },
  NO_HAND: { message: 'Подними руку перед камерой, ладонью к экрану', severity: 'info' },
}

/** Что машина знает о несомом элементе. Отметки времени — последние кадры, где случилось событие. */
export interface CarryInfo {
  /** Рука несёт прилипший элемент. */
  readonly carrying: boolean
  /** Мах с элементом без жеста кулака. */
  readonly swingAt: number | undefined
  /** Медленный щелчок на ходу положил элемент, а не выбросил. */
  readonly slowThrowAt: number | undefined
}

export interface HintHandInput {
  readonly hand: HandId
  readonly phase: HandPhase
  readonly closure: number
  /** Центр ладони в координатах кадра. */
  readonly center: Vec2
  readonly palmSize: number
  readonly score: number
  /** Классификатор видит жест двух пальцев, но неуверенно. */
  readonly nearPan?: boolean
  /** Классификатор видит щипок, но неуверенно. */
  readonly nearPinch?: boolean
  /** Рука несёт элемент и показывает жест доски: панорама и зум при переносе выключены. */
  readonly navLocked?: boolean
  /**
   * Рука показывает щипок. Пальцы щипка наполовину согнуты, и по углам это похоже на недожатый
   * кулак: без этого флага зум щипком просил бы «сожми кулак полностью».
   */
  readonly pinching?: boolean
  readonly carry?: CarryInfo
}

export interface HintInput {
  readonly t: number
  readonly hands: readonly HintHandInput[]
  /** Руки, потерянные в этом кадре на высокой скорости. */
  readonly lostFast: readonly HandId[]
  readonly thresholds: Thresholds
}

export interface HintState {
  /** Когда каждый код отправлялся в последний раз. */
  readonly lastSent: Readonly<Record<string, number>>
  /** С какого момента держится каждое условие, ключ «код:рука». */
  readonly since: Readonly<Record<string, number>>
  /** Последний момент, когда была видна хоть одна рука, или начало работы. */
  readonly lastHandAt: number | undefined
  /** Когда отправлялась любая подсказка: следующая не раньше чем через HINT_GAP_MS. */
  readonly lastAnyAt: number | undefined
  /**
   * Отправленные подсказки, которые ещё не сняты: код → последний кадр, где их условие
   * выполнялось. Когда условие отсутствует дольше HINT_CLEAR_MS, по коду уходит снятие.
   */
  readonly live: Readonly<Record<string, number>>
}

interface Condition {
  readonly code: HintCode
  readonly hand: HandId | undefined
  readonly active: boolean
  readonly holdMs: number
}

/**
 * Порядок разбора. На экране один тост, поэтому из всех сработавших условий отправляется
 * ровно одно — иначе показывается то, что оказалось последним в списке, и человек получает
 * ответ не на свою проблему. Так «рука у края кадра» подменялась на «отойди на шаг назад».
 *
 * Порядок не произвольный: сначала то, что делает недостоверными остальные измерения.
 * Нет руки — мерить нечего. Плохо видно — не верим ничему. Рука у края — точки обрезаны,
 * и размер ладони, из которого считается расстояние, там завышен. И только потом расстояние,
 * полужесты и скорость.
 */
const PRIORITY: readonly HintCode[] = [
  'NO_HAND',
  'POOR_TRACKING',
  'HAND_NEAR_EDGE',
  'TOO_CLOSE',
  'TOO_FAR',
  'HALF_RELEASE',
  'HALF_GRAB',
  'HALF_PAN',
  'HALF_PINCH',
  'CARRY_THROW_SLOW',
  'CARRY_THROW_HOW',
  'CARRY_NAV_BUSY',
  'CARRY_PUT_HOW',
  'MOVING_TOO_FAST',
  'SWIPE_SHORT',
  'SWIPE_DIAGONAL',
]

const rankOf = (c: HintCode): number => {
  const i = PRIORITY.indexOf(c)
  return i < 0 ? PRIORITY.length : i
}

export const initialHints = (): HintState => ({ lastSent: {}, since: {}, lastHandAt: undefined, lastAnyAt: undefined, live: {} })

const recent = (at: number | undefined, t: number): boolean => at !== undefined && t - at <= CARRY_FLASH_MS

/**
 * Подсказки переноса. Ладонь с элементом раскрыта долго — человек ждёт, что элемент упадёт сам.
 * Мах без кулака — пытается бросить по-старому. Медленный щелчок на махе — бросок не засчитан.
 */
function carryConditions(h: HintHandInput, th: Thresholds, t: number): Condition[] {
  const k = h.carry
  const c = (code: CarryHintCode, active: boolean, holdMs: number): Condition => ({ code, hand: h.hand, active, holdMs })
  return [
    c('CARRY_PUT_HOW', h.phase === 'carrying' && h.closure < th.open, CARRY_OPEN_HINT_MS),
    c('CARRY_THROW_HOW', recent(k?.swingAt, t), 0),
    c('CARRY_THROW_SLOW', recent(k?.slowThrowAt, t), 0),
    c('CARRY_NAV_BUSY', h.navLocked === true, CARRY_NAV_HINT_MS),
  ]
}

/**
 * «Раскрой ладонь шире» нужна там, где раскрытие что-то делает: кулак без элемента и щелчок,
 * которым кладут. Рука, несущая элемент, бывает в любой позе, и полусогнутые пальцы там — норма.
 */
const releasing = (h: HintHandInput): boolean => h.phase === 'clicking' || (isFistPhase(h.phase) && h.carry?.carrying !== true)

function handConditions(h: HintHandInput, th: Thresholds, t: number): Condition[] {
  const inBand = h.closure >= th.open && h.closure <= th.hold
  const holding = isHoldingPhase(h.phase)
  const nearEdge = edgeDistance(h.center) < EDGE_HINT_MARGIN
  const c = (code: HintCode, active: boolean, holdMs: number): Condition => ({ code, hand: h.hand, active, holdMs })
  return [
    ...carryConditions(h, th, t),
    c('HALF_GRAB', inBand && !holding && h.pinching !== true, HALF_GESTURE_MS),
    c('HALF_RELEASE', inBand && releasing(h), HALF_GESTURE_MS),
    c('HALF_PAN', h.nearPan === true, NEAR_PAN_HINT_MS),
    c('HALF_PINCH', h.nearPinch === true, NEAR_PINCH_HINT_MS),
    c('HAND_NEAR_EDGE', nearEdge, GEOMETRY_HINT_MS),
    // Расстояние считается по размеру ладони, а у края кадра часть точек обрезана и размер
    // завышен: там про расстояние сказать нечего, и советовать отойти — это советовать не то.
    c('TOO_FAR', !nearEdge && h.palmSize < PALM_SIZE_MIN, GEOMETRY_HINT_MS),
    c('TOO_CLOSE', !nearEdge && h.palmSize > PALM_SIZE_MAX, GEOMETRY_HINT_MS),
    c('POOR_TRACKING', h.score < POOR_TRACKING_SCORE, POOR_TRACKING_MS),
  ]
}

function conditions(input: HintInput): Condition[] {
  const perHand = input.hands.flatMap((h) => handConditions(h, input.thresholds, input.t))
  const fast = input.lostFast.map((hand): Condition => ({ code: 'MOVING_TOO_FAST', hand, active: true, holdMs: 0 }))
  const noHand: Condition = { code: 'NO_HAND', hand: undefined, active: input.hands.length === 0, holdMs: NO_HAND_MS }
  return [...perHand, ...fast, noHand]
}

const keyOf = (c: Condition): string => `${c.code}:${c.hand ?? '*'}`

const toHint = (c: Condition): HintEvt => ({ code: c.code, ...HINT_TEXTS[c.code], ...(c.hand ? { hand: c.hand } : {}) })

/**
 * Снятие подсказок, чьи условия ушли. Исправился — тост уходит сразу, а не досиживает своё время:
 * иначе «отойди на шаг назад» висит ещё две секунды после того, как человек уже отошёл.
 *
 * Снимаются только длящиеся условия. У разового события — мах без кулака, потеря руки на скорости —
 * нечему перестать выполняться, и его подсказка живёт по таймеру, как раньше.
 */
function clearGone(live: Record<string, number>, t: number): HintEvt[] {
  const gone: HintEvt[] = []
  for (const [code, lastActive] of Object.entries(live)) {
    if (t - lastActive < HINT_CLEAR_MS) continue
    delete live[code]
    gone.push({ code, message: '', severity: 'info', cleared: true })
  }
  return gone
}

export function stepHints(s: HintState, input: HintInput): { state: HintState; hints: HintEvt[] } {
  const { t } = input
  const lastHandAt = input.hands.length > 0 ? t : (s.lastHandAt ?? t)
  const since: Record<string, number> = {}
  const lastSent: Record<string, number> = { ...s.lastSent }
  const live: Record<string, number> = { ...s.live }
  // Отсчёт ведётся по всем активным условиям, даже если отправлено будет одно: иначе таймер
  // проигравшего условия сбрасывается каждый кадр и оно не созревает никогда.
  const ready: Condition[] = []
  for (const c of conditions(input)) {
    if (!c.active) continue
    const key = keyOf(c)
    const start = s.since[key] ?? (c.code === 'NO_HAND' ? lastHandAt : t)
    since[key] = start
    if (live[c.code] !== undefined) live[c.code] = t
    const cooled = t - (lastSent[c.code] ?? -Infinity) >= HINT_COOLDOWN_MS
    if (t - start >= c.holdMs && cooled) ready.push(c)
  }
  const hints = clearGone(live, t)
  const winner = ready.reduce<Condition | undefined>((best, c) => (!best || rankOf(c.code) < rankOf(best.code) ? c : best), undefined)
  const gapPassed = t - (s.lastAnyAt ?? -Infinity) >= HINT_GAP_MS
  if (!winner || !gapPassed) return { state: { lastSent, since, lastHandAt, lastAnyAt: s.lastAnyAt, live }, hints }
  lastSent[winner.code] = t
  since[keyOf(winner)] = t
  if (winner.holdMs > 0) live[winner.code] = t
  return { state: { lastSent, since, lastHandAt, lastAnyAt: t, live }, hints: [...hints, toHint(winner)] }
}
