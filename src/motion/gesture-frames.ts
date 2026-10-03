import type { ZoomEvt } from '../contracts/input'
import { DEFAULT_VOTER } from '../gestures/voter'
import type { Pose, RawPose } from '../gestures/model'
import { NEAR_PAN_GRACE_MS } from './constants'
import { stepPan, type PanState } from './pan'
import { stepPinchZoom, type PinchZoomState } from './pinch-zoom'
import type { Vec2 } from './types'

/**
 * Жесты одной руки, которые двигают доску, по кадру: панорама двумя пальцами и зум щипком.
 * Двигается сглаженная точка руки, а не курсор: курсор на время жеста стоит, иначе мерить было бы
 * нечего. Пока рука держит элемент, жесты доски не включаются: форма кисти при удержании — это хват.
 */

/** Поза панорамы: указательный и средний вытянуты, остальные согнуты. */
export const PAN_POSE: Pose = 'victory'
/** Поза зума: большой и указательный сомкнуты, остальные согнуты. */
export const PINCH_POSE: Pose = 'pinch'

/** Нижняя граница уверенности «почти жеста» для подсказок. */
export const NEAR_MISS_MIN = 0.4

export interface GestureFrameInput {
  /** Сырая поза классификатора в этом кадре. */
  readonly raw: RawPose | undefined
  /** Устойчивая поза после голосования. */
  readonly pose: Pose | undefined
  /** Сглаженная точка руки в долях экрана. */
  readonly motion: Vec2
  /** Рука держит элемент: по машине или по тому, что уже знает потребитель. */
  readonly holding: boolean
  readonly t: number
}

export interface NearMiss {
  /** Последний кадр, где классификатор видел позу неуверенно. */
  readonly at: number | undefined
  /** Неуверенная поза держится, с допуском на кадры другой позы короче NEAR_PAN_GRACE_MS. */
  readonly near: boolean
}

/** «Почти жест»: сырая поза та, но уверенность ниже порога голосования. */
export function nearMiss(prevAt: number | undefined, label: Pose, i: GestureFrameInput): NearMiss {
  const { raw, t } = i
  const unsure = raw !== undefined && raw.label === label && raw.confidence >= NEAR_MISS_MIN && raw.confidence < DEFAULT_VOTER.threshold
  const at = i.pose === label || i.holding ? undefined : unsure ? t : prevAt
  return { at, near: at !== undefined && t - at <= NEAR_PAN_GRACE_MS }
}

export interface PanFrame {
  readonly pan: PanState
  readonly delta: Vec2 | undefined
  readonly nearPan: NearMiss
}

export function panFrame(pan: PanState, nearAt: number | undefined, i: GestureFrameInput): PanFrame {
  const active = i.pose === PAN_POSE && !i.holding
  const r = stepPan(pan, { active, steady: i.raw?.label === PAN_POSE, p: i.motion })
  return { pan: r.state, delta: r.delta, nearPan: nearMiss(nearAt, PAN_POSE, i) }
}

export interface PinchFrame {
  readonly pinch: PinchZoomState
  readonly zoom: ZoomEvt | undefined
  readonly nearPinch: NearMiss
  /** Щипок вели вбок: жест держится, а масштаб не меняется. Для подсказки. */
  readonly sideways: boolean
}

/** cursor — курсор, который пользователь видел до этого кадра: центр масштаба. */
export function pinchFrame(pinch: PinchZoomState, nearAt: number | undefined, i: GestureFrameInput, cursor: Vec2): PinchFrame {
  const active = i.pose === PINCH_POSE && !i.holding
  const r = stepPinchZoom(pinch, { active, steady: i.raw?.label === PINCH_POSE, p: i.motion, cursor })
  return { pinch: r.state, zoom: r.zoom, nearPinch: nearMiss(nearAt, PINCH_POSE, i), sideways: r.sideways === true }
}

/**
 * Жест доски показан рукой, которая несёт элемент. Панорама и зум в этом случае выключены
 * намеренно — иначе доска уезжала бы из-под переносимого элемента, — но снаружи это выглядит
 * как сломанный жест: поза та, а доска стоит. Отсюда подсказка.
 */
export const navLocked = (i: GestureFrameInput): boolean =>
  i.holding && (i.pose === PAN_POSE || i.pose === PINCH_POSE)
