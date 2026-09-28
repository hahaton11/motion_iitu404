import type { HandId, HintEvt, MotionHintCode } from '../contracts/input'
import {
  EDGE_HINT_MARGIN,
  GEOMETRY_HINT_MS,
  HALF_GESTURE_MS,
  HINT_COOLDOWN_MS,
  NO_HAND_MS,
  PALM_SIZE_MAX,
  PALM_SIZE_MIN,
  POOR_TRACKING_MS,
  POOR_TRACKING_SCORE,
} from './constants'
import { isHoldingPhase, type HandPhase } from './hand-state'
import { edgeDistance } from './landmarks'
import type { Thresholds, Vec2 } from './types'

/** Детектор подсказок режима «ошибка»: условие должно продержаться, один код не чаще раза в 3 секунды. */

export const HINT_TEXTS: Readonly<Record<MotionHintCode, Pick<HintEvt, 'message' | 'severity'>>> = {
  HALF_GRAB: { message: 'Сожми кулак полностью, чтобы взять', severity: 'warn' },
  HALF_RELEASE: { message: 'Раскрой ладонь шире, чтобы отпустить', severity: 'warn' },
  HAND_NEAR_EDGE: { message: 'Рука у края кадра, веди её ближе к центру', severity: 'info' },
  TOO_FAR: { message: 'Подойди на шаг ближе к камере', severity: 'info' },
  TOO_CLOSE: { message: 'Отойди на шаг назад, рука не помещается в кадр', severity: 'info' },
  MOVING_TOO_FAST: { message: 'Двигай рукой чуть медленнее, камера не успевает', severity: 'warn' },
  POOR_TRACKING: { message: 'Мало света, повернись к источнику света', severity: 'info' },
  SWIPE_SHORT: { message: 'Махни шире, примерно на полруки, чтобы перейти', severity: 'info' },
  SWIPE_DIAGONAL: { message: 'Махни строго вбок или строго вверх-вниз', severity: 'info' },
  NO_HAND: { message: 'Подними руку перед камерой, ладонью к экрану', severity: 'info' },
}

export interface HintHandInput {
  readonly hand: HandId
  readonly phase: HandPhase
  readonly closure: number
  /** Центр ладони в координатах кадра. */
  readonly center: Vec2
  readonly palmSize: number
  readonly score: number
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
}

interface Condition {
  readonly code: MotionHintCode
  readonly hand: HandId | undefined
  readonly active: boolean
  readonly holdMs: number
}

export const initialHints = (): HintState => ({ lastSent: {}, since: {}, lastHandAt: undefined })

function handConditions(h: HintHandInput, th: Thresholds): Condition[] {
  const inBand = h.closure >= th.open && h.closure <= th.hold
  const holding = isHoldingPhase(h.phase)
  const c = (code: MotionHintCode, active: boolean, holdMs: number): Condition => ({ code, hand: h.hand, active, holdMs })
  return [
    c('HALF_GRAB', inBand && !holding, HALF_GESTURE_MS),
    c('HALF_RELEASE', inBand && holding, HALF_GESTURE_MS),
    c('HAND_NEAR_EDGE', edgeDistance(h.center) < EDGE_HINT_MARGIN, GEOMETRY_HINT_MS),
    c('TOO_FAR', h.palmSize < PALM_SIZE_MIN, GEOMETRY_HINT_MS),
    c('TOO_CLOSE', h.palmSize > PALM_SIZE_MAX, GEOMETRY_HINT_MS),
    c('POOR_TRACKING', h.score < POOR_TRACKING_SCORE, POOR_TRACKING_MS),
  ]
}

function conditions(input: HintInput): Condition[] {
  const perHand = input.hands.flatMap((h) => handConditions(h, input.thresholds))
  const fast = input.lostFast.map((hand): Condition => ({ code: 'MOVING_TOO_FAST', hand, active: true, holdMs: 0 }))
  const noHand: Condition = { code: 'NO_HAND', hand: undefined, active: input.hands.length === 0, holdMs: NO_HAND_MS }
  return [...perHand, ...fast, noHand]
}

const keyOf = (c: Condition): string => `${c.code}:${c.hand ?? '*'}`

const toHint = (c: Condition): HintEvt => ({ code: c.code, ...HINT_TEXTS[c.code], ...(c.hand ? { hand: c.hand } : {}) })

export function stepHints(s: HintState, input: HintInput): { state: HintState; hints: HintEvt[] } {
  const { t } = input
  const lastHandAt = input.hands.length > 0 ? t : (s.lastHandAt ?? t)
  const since: Record<string, number> = {}
  const lastSent: Record<string, number> = { ...s.lastSent }
  const hints: HintEvt[] = []
  for (const c of conditions(input)) {
    if (!c.active) continue
    const key = keyOf(c)
    const start = s.since[key] ?? (c.code === 'NO_HAND' ? lastHandAt : t)
    since[key] = start
    const cooled = t - (lastSent[c.code] ?? -Infinity) >= HINT_COOLDOWN_MS
    if (t - start < c.holdMs || !cooled) continue
    hints.push(toHint(c))
    lastSent[c.code] = t
    since[key] = t
  }
  return { state: { lastSent, since, lastHandAt }, hints }
}
