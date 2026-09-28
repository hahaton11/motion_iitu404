import type { HandId, InputEventMap, InputEventType } from '../contracts/input'
import { LOST_FAST_SPEED } from './constants'
import { computeFeatures, type HandFeatures } from './features'
import {
  DEFAULT_THRESHOLDS,
  handSpeed,
  initialHandState,
  isHoldingPhase,
  isPresent,
  stepHand,
  stepHandMissing,
  type HandEvent,
  type HandPhase,
  type HandState,
} from './hand-state'
import { initialHints, stepHints, type HintHandInput, type HintState } from './hints'
import { initialSwipe, resetSwipe, stepSwipe, type SwipeOutcome, type SwipeState } from './swipe'
import { initialVoter, stepVoter, type VoterState } from '../gestures/voter'
import type { Pose } from '../gestures/model'
import { oneEuro2DStep, oneEuro2DValue, type OneEuro2DState } from './one-euro'
import { DEFAULT_POINTER, boxToScreen, initialPointer, stepPointer, type PointerBox, type PointerState } from './pointer'
import { initialTwoHands, stepTwoHands, type HandSnapshot, type TwoHandsState } from './two-hands'
import type { HandDetection, Thresholds, TrackerFrame, Vec2 } from './types'

/**
 * Чистая обработка кадра трекера: признаки → фильтр → машина состояний → zoom → подсказки.
 * Возвращает события контракта в порядке отправки. CameraInput только отправляет их.
 */

export type OutEvent = { [K in InputEventType]: { readonly type: K; readonly e: InputEventMap[K] } }[InputEventType]

interface HandTrack {
  readonly machine: HandState
  /** Сглаженные координаты для машины состояний: без заморозки и поводка, чтобы скорость броска была честной. */
  readonly filter: OneEuro2DState | undefined
  /** Курсор, который видит пользователь. */
  readonly pointer: PointerState
  readonly swipe: SwipeState
  /** Сглаживание позы классификатора по кадрам. */
  readonly voter: VoterState
  /** Что знает потребитель: держит ли рука элемент по отправленным событиям. */
  readonly emittedHolding: boolean
}

export interface PipelineState {
  readonly hands: Readonly<Record<HandId, HandTrack>>
  readonly zoom: TwoHandsState
  readonly hints: HintState
  readonly thresholds: Thresholds
  readonly box: PointerBox
}

/** Отладочные данные руки для демо. */
export interface HandDebug {
  readonly hand: HandId
  readonly detection: HandDetection
  readonly features: HandFeatures
  readonly phase: HandPhase
  readonly screen: Vec2
  /** Устойчивая поза классификатора, если он работает. */
  readonly pose?: Pose
  /** Курсор на паузе: рука в бездействии. */
  readonly paused: boolean
}

export interface FrameResult {
  readonly state: PipelineState
  readonly events: readonly OutEvent[]
  readonly debug: readonly HandDebug[]
}

const HAND_IDS: readonly HandId[] = ['left', 'right']

const emptyTrack = (): HandTrack => ({
  machine: initialHandState(),
  filter: undefined,
  pointer: initialPointer(),
  swipe: initialSwipe(),
  voter: initialVoter(),
  emittedHolding: false,
})

export const initialPipeline = (
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
  box: PointerBox = DEFAULT_POINTER.box,
): PipelineState => ({
  hands: { left: emptyTrack(), right: emptyTrack() },
  zoom: initialTwoHands(),
  hints: initialHints(),
  thresholds,
  box,
})

export const withThresholds = (s: PipelineState, thresholds: Thresholds): PipelineState => ({ ...s, thresholds })

export const withPointerBox = (s: PipelineState, box: PointerBox): PipelineState => ({ ...s, box })

interface HandStep {
  readonly track: HandTrack
  readonly machineEvents: readonly HandEvent[]
  readonly debug: HandDebug | undefined
  readonly lostFast: boolean
  readonly swipe?: SwipeOutcome
}

/** События машины получают координаты видимого курсора, чтобы элемент падал там, где его видно. */
const atCursor = (e: HandEvent, p: Vec2): HandEvent => (e.type === 'handlost' ? e : { ...e, x: p.x, y: p.y })

/** Поза → вход машины захвата. Бездействие даёт closure между порогами: состояние не меняется. */
const POSE_SHAPE: Readonly<Record<Pose, { closure: number; indexOnly: boolean }>> = {
  fist: { closure: 1, indexOnly: false },
  open: { closure: 0, indexOnly: false },
  victory: { closure: 0, indexOnly: false },
  point: { closure: 0, indexOnly: true },
  idle: { closure: 0.6, indexOnly: false },
}

/** Нижняя граница уверенности «почти жеста» для подсказок. */
const NEAR_MISS_MIN = 0.4

/**
 * closure для подсказок: «почти кулак» — сырая поза fist с недостаточной уверенностью, «почти ладонь»
 * при удержании — сырая open с недостаточной уверенностью. Иначе вне полосы, подсказок нет.
 */
function hintClosure(raw: NonNullable<HandDetection['pose']>, holding: boolean, th: Thresholds): number {
  const near = raw.confidence >= NEAR_MISS_MIN && raw.confidence < 0.75
  const inBand = (th.open + th.hold) / 2
  if (near && raw.label === 'fist' && !holding) return inBand
  if (near && raw.label === 'open' && holding) return inBand
  return holding ? 1 : 0
}

function stepSeen(track: HandTrack, det: HandDetection, t: number, th: Thresholds, box: PointerBox): HandStep {
  const features = computeFeatures(det)
  const filter = oneEuro2DStep(track.filter, boxToScreen(features.center, box), t)
  const motion = oneEuro2DValue(filter)
  const holding = isHoldingPhase(track.machine.phase)
  const voter = det.pose ? stepVoter(track.voter, det.pose) : track.voter
  const pose = det.pose ? voter.stable : undefined
  const shape = pose ? POSE_SHAPE[pose] : { closure: features.closure, indexOnly: features.indexOnly }
  const r = stepHand(track.machine, { t, x: motion.x, y: motion.y, ...shape }, th)
  const paused = pose === 'idle' && !holding
  const transitioning = !pose && features.closure > th.open && features.closure < th.hold
  const p = stepPointer(track.pointer, features.center, t, { holding, transitioning, paused }, { ...DEFAULT_POINTER, box })
  const screen = p.screen
  const hintFeatures = det.pose ? { ...features, closure: hintClosure(det.pose, holding, th) } : features
  const debug: HandDebug = { hand: det.hand, detection: det, features: hintFeatures, phase: r.state.phase, screen, paused, ...(pose ? { pose } : {}) }
  const machineEvents = r.events.map((e) => atCursor(e, screen))
  const sw = stepSwipe(track.swipe, { t, p: motion, holding: isHoldingPhase(r.state.phase) })
  const next = { ...track, machine: r.state, filter, pointer: p.state, swipe: sw.state, voter }
  return { track: next, machineEvents, debug, lostFast: false, ...(sw.outcome ? { swipe: sw.outcome } : {}) }
}

/** Взмах в событие контракта, неудачный взмах — в подсказку. Во время zoom взмахи не шлются. */
function swipeEvents(hand: HandId, step: HandStep, suppress: boolean): OutEvent[] {
  const o = step.swipe
  if (!o || suppress) return []
  // Неудачные взмахи подсказками не сообщаются: в режиме курсора быстрые движения руки — норма.
  return o.kind === 'swipe' ? [{ type: 'swipe', e: { hand, dir: o.dir, holding: o.holding } }] : []
}

function stepMissing(track: HandTrack, t: number): HandStep {
  const speed = handSpeed(track.machine)
  const r = stepHandMissing(track.machine, t)
  const lost = r.events.some((e) => e.type === 'handlost')
  if (!lost) {
    return { track: { ...track, machine: r.state, swipe: resetSwipe(track.swipe) }, machineEvents: [], debug: undefined, lostFast: false }
  }
  // Release решается по тому, что знает потребитель: во время zoom машина могла отпустить молча.
  // Тип и скорость берутся у машины: она одна знает, был ли это бросок. Координаты — от курсора,
  // чтобы элемент улетел оттуда, где его видел пользователь.
  const { x, y } = track.pointer.out ?? track.machine
  const isDrop = (e: HandEvent): e is Extract<HandEvent, { type: 'release' | 'throw' }> =>
    e.type === 'release' || e.type === 'throw'
  const fromMachine = r.events.find(isDrop)
  const release: HandEvent[] = track.emittedHolding
    ? [fromMachine ? { ...fromMachine, x, y } : { type: 'release', x, y, vx: 0, vy: 0 }]
    : []
  const events: HandEvent[] = [...release, { type: 'handlost' }]
  return { track: emptyTrack(), machineEvents: events, debug: undefined, lostFast: speed > LOST_FAST_SPEED }
}

function toOut(hand: HandId, e: HandEvent): OutEvent {
  switch (e.type) {
    case 'grab':
      return { type: 'grab', e: { hand, x: e.x, y: e.y } }
    case 'point':
      return { type: 'point', e: { hand, x: e.x, y: e.y } }
    case 'handlost':
      return { type: 'handlost', e: { hand } }
    case 'release':
    case 'throw':
      return { type: e.type, e: { hand, x: e.x, y: e.y, vx: e.vx, vy: e.vy } }
  }
}

const isGrabLike = (e: HandEvent): boolean => e.type === 'grab' || e.type === 'release' || e.type === 'throw'

/** Отправка событий машины одной руки с учётом подавления на время zoom. */
function emitHand(hand: HandId, step: HandStep, suppress: boolean): { track: HandTrack; out: OutEvent[] } {
  const lostPath = step.debug === undefined
  const allowed = step.machineEvents.filter((e) => lostPath || !suppress || !isGrabLike(e))
  const emittedHolding = allowed.reduce(
    (h, e) => (e.type === 'grab' ? true : e.type === 'release' || e.type === 'throw' ? false : h),
    step.track.emittedHolding,
  )
  return { track: { ...step.track, emittedHolding }, out: allowed.map((e) => toOut(hand, e)) }
}

/** После конца zoom сверяет то, что знает потребитель, с реальным состоянием руки. */
function reconcile(hand: HandId, track: HandTrack): { track: HandTrack; out: OutEvent[] } {
  const holding = isHoldingPhase(track.machine.phase)
  if (!isPresent(track.machine) || holding === track.emittedHolding) return { track, out: [] }
  const { x, y } = track.pointer.out ?? track.machine
  const out: OutEvent = holding
    ? { type: 'grab', e: { hand, x, y } }
    : { type: 'release', e: { hand, x, y, vx: 0, vy: 0 } }
  return { track: { ...track, emittedHolding: holding }, out: [out] }
}

const snapshot = (step: HandStep): HandSnapshot | undefined =>
  step.debug ? { x: step.debug.screen.x, y: step.debug.screen.y, holding: isHoldingPhase(step.track.machine.phase) } : undefined

function cursorOf(d: HandDebug, track: HandTrack): OutEvent {
  const e = {
    hand: d.hand,
    x: d.screen.x,
    y: d.screen.y,
    closure: d.features.closure,
    holding: track.emittedHolding,
    ...(d.pose ? { engaged: !d.paused } : {}),
  }
  return { type: 'cursor', e }
}

function hintInputs(debug: readonly HandDebug[]): HintHandInput[] {
  return debug.map((d) => ({
    hand: d.hand,
    phase: d.phase,
    closure: d.features.closure,
    center: d.features.center,
    palmSize: d.features.palmSize,
    score: d.detection.score,
  }))
}

export function processFrame(s: PipelineState, frame: TrackerFrame): FrameResult {
  const { t } = frame
  const steps = HAND_IDS.map((hand) => {
    const det = frame.hands.find((h) => h.hand === hand)
    return det ? stepSeen(s.hands[hand], det, t, s.thresholds, s.box) : stepMissing(s.hands[hand], t)
  }) as [HandStep, HandStep]
  const tz = stepTwoHands(s.zoom, { t, left: snapshot(steps[0]), right: snapshot(steps[1]) })
  const emitted = HAND_IDS.map((hand, i) => emitHand(hand, steps[i]!, tz.suppress))
  const final = HAND_IDS.map((hand, i) => (tz.ended ? reconcile(hand, emitted[i]!.track) : { track: emitted[i]!.track, out: [] }))
  const tracks = { left: final[0]!.track, right: final[1]!.track }
  const debug = steps.flatMap((st) => (st.debug ? [st.debug] : []))
  const lostFast = HAND_IDS.filter((_, i) => steps[i]!.lostFast)
  const hints = stepHints(s.hints, { t, hands: hintInputs(debug), lostFast, thresholds: s.thresholds })
  const events: OutEvent[] = [
    ...debug.map((d) => cursorOf(d, tracks[d.hand])),
    ...emitted.flatMap((x) => x.out),
    ...final.flatMap((x) => x.out),
    ...(tz.zoom ? [{ type: 'zoom', e: tz.zoom } as const] : []),
    ...HAND_IDS.flatMap((hand, i) => swipeEvents(hand, steps[i]!, tz.suppress || tz.zoom !== undefined)),
    ...hints.hints.map((e) => ({ type: 'hint', e }) as const),
  ]
  return { state: { ...s, hands: tracks, zoom: tz.state, hints: hints.state }, events, debug }
}
