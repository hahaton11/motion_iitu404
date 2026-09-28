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
import { oneEuro2DStep, oneEuro2DValue, type OneEuro2DState } from './one-euro'
import { frameToScreen } from './landmarks'
import { initialPointer, stepPointer, type PointerState } from './pointer'
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
  /** Что знает потребитель: держит ли рука элемент по отправленным событиям. */
  readonly emittedHolding: boolean
}

export interface PipelineState {
  readonly hands: Readonly<Record<HandId, HandTrack>>
  readonly zoom: TwoHandsState
  readonly hints: HintState
  readonly thresholds: Thresholds
}

/** Отладочные данные руки для демо. */
export interface HandDebug {
  readonly hand: HandId
  readonly detection: HandDetection
  readonly features: HandFeatures
  readonly phase: HandPhase
  readonly screen: Vec2
  /** Сцеп трекпада: рука сейчас ведёт курсор. */
  readonly engaged: boolean
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
  emittedHolding: false,
})

export const initialPipeline = (thresholds: Thresholds = DEFAULT_THRESHOLDS): PipelineState => ({
  hands: { left: emptyTrack(), right: emptyTrack() },
  zoom: initialTwoHands(),
  hints: initialHints(),
  thresholds,
})

export const withThresholds = (s: PipelineState, thresholds: Thresholds): PipelineState => ({ ...s, thresholds })


interface HandStep {
  readonly track: HandTrack
  readonly machineEvents: readonly HandEvent[]
  readonly debug: HandDebug | undefined
  readonly lostFast: boolean
}

/** События машины получают координаты видимого курсора, чтобы элемент падал там, где его видно. */
const atCursor = (e: HandEvent, p: Vec2): HandEvent => (e.type === 'handlost' ? e : { ...e, x: p.x, y: p.y })

/**
 * Жесты трекпада: щипок — захват, «V» — указание, вытянутый указательный — сцеп курсора.
 * Машина состояний получает силу щипка на месте closure и «V» на месте указательного жеста.
 */
function stepSeen(track: HandTrack, det: HandDetection, t: number, th: Thresholds): HandStep {
  const features = computeFeatures(det)
  const filter = oneEuro2DStep(track.filter, frameToScreen(features.center), t)
  const motion = oneEuro2DValue(filter)
  const frame = { t, x: motion.x, y: motion.y, closure: features.pinch, indexOnly: features.victory }
  const r = stepHand(track.machine, frame, th)
  const holding = isHoldingPhase(track.machine.phase)
  const transitioning = features.pinch > th.open && features.pinch < th.hold
  const ctx = { engaged: features.indexOnly || holding || transitioning, holding, transitioning }
  const p = stepPointer(track.pointer, features.center, t, ctx)
  const screen = p.screen
  const debug: HandDebug = { hand: det.hand, detection: det, features, phase: r.state.phase, screen, engaged: ctx.engaged }
  const machineEvents = r.events.map((e) => atCursor(e, screen))
  return { track: { ...track, machine: r.state, filter, pointer: p.state }, machineEvents, debug, lostFast: false }
}

function stepMissing(track: HandTrack, t: number): HandStep {
  const speed = handSpeed(track.machine)
  const r = stepHandMissing(track.machine, t)
  const lost = r.events.some((e) => e.type === 'handlost')
  if (!lost) return { track: { ...track, machine: r.state }, machineEvents: [], debug: undefined, lostFast: false }
  // Release решается по тому, что знает потребитель: во время zoom машина могла отпустить молча.
  const { x, y } = track.pointer.out ?? track.machine
  const release: HandEvent[] = track.emittedHolding ? [{ type: 'release', x, y, vx: 0, vy: 0 }] : []
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
  const e = { hand: d.hand, x: d.screen.x, y: d.screen.y, closure: d.features.pinch, holding: track.emittedHolding, engaged: d.engaged }
  return { type: 'cursor', e }
}

function hintInputs(debug: readonly HandDebug[], tracks: Readonly<Record<HandId, HandTrack>>): HintHandInput[] {
  return debug.map((d) => ({
    hand: d.hand,
    phase: d.phase,
    closure: d.features.pinch,
    engaged: d.engaged,
    speed: handSpeed(tracks[d.hand].machine),
    center: d.features.center,
    palmSize: d.features.palmSize,
    score: d.detection.score,
  }))
}

export function processFrame(s: PipelineState, frame: TrackerFrame): FrameResult {
  const { t } = frame
  const steps = HAND_IDS.map((hand) => {
    const det = frame.hands.find((h) => h.hand === hand)
    return det ? stepSeen(s.hands[hand], det, t, s.thresholds) : stepMissing(s.hands[hand], t)
  }) as [HandStep, HandStep]
  const tz = stepTwoHands(s.zoom, { t, left: snapshot(steps[0]), right: snapshot(steps[1]) })
  const emitted = HAND_IDS.map((hand, i) => emitHand(hand, steps[i]!, tz.suppress))
  const final = HAND_IDS.map((hand, i) => (tz.ended ? reconcile(hand, emitted[i]!.track) : { track: emitted[i]!.track, out: [] }))
  const tracks = { left: final[0]!.track, right: final[1]!.track }
  const debug = steps.flatMap((st) => (st.debug ? [st.debug] : []))
  const lostFast = HAND_IDS.filter((_, i) => steps[i]!.lostFast)
  const hints = stepHints(s.hints, { t, hands: hintInputs(debug, tracks), lostFast, thresholds: s.thresholds })
  const events: OutEvent[] = [
    ...debug.map((d) => cursorOf(d, tracks[d.hand])),
    ...emitted.flatMap((x) => x.out),
    ...final.flatMap((x) => x.out),
    ...(tz.zoom ? [{ type: 'zoom', e: tz.zoom } as const] : []),
    ...hints.hints.map((e) => ({ type: 'hint', e }) as const),
  ]
  return { state: { ...s, hands: tracks, zoom: tz.state, hints: hints.state }, events, debug }
}
