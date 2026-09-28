import type { ZoomEvt } from '../contracts/input'
import { ZOOM_END_GRACE_MS, ZOOM_MIN_CHANGE, ZOOM_MIN_DISTANCE } from './constants'

/**
 * Zoom двумя руками. Сеанс начинается, когда обе руки в захвате, и заканчивается,
 * когда хотя бы одна рука дольше ZOOM_END_GRACE_MS вне захвата. Пока сеанс идёт,
 * grab, release и throw этих рук не отправляются, чтобы дрожание кулака не порождало лишних событий.
 */

export interface HandSnapshot {
  readonly x: number
  readonly y: number
  readonly holding: boolean
}

export interface TwoHandsInput {
  readonly t: number
  readonly left: HandSnapshot | undefined
  readonly right: HandSnapshot | undefined
}

export interface TwoHandsState {
  readonly active: boolean
  /** Расстояние, от которого считается следующий factor. */
  readonly refDist: number | undefined
  readonly graceSince: number | undefined
}

export interface TwoHandsResult {
  readonly state: TwoHandsState
  readonly zoom: ZoomEvt | undefined
  /** Сеанс шёл до этого кадра: события захвата этих рук надо подавить. */
  readonly suppress: boolean
  /** Сеанс закончился в этом кадре: потребителю нужно сверить состояние рук. */
  readonly ended: boolean
}

export const initialTwoHands = (): TwoHandsState => ({ active: false, refDist: undefined, graceSince: undefined })

function stepBoth(s: TwoHandsState, l: HandSnapshot, r: HandSnapshot): Pick<TwoHandsResult, 'state' | 'zoom'> {
  const dist = Math.hypot(l.x - r.x, l.y - r.y)
  const base: TwoHandsState = { active: true, refDist: s.refDist, graceSince: undefined }
  if (s.refDist === undefined || s.refDist < ZOOM_MIN_DISTANCE || dist < ZOOM_MIN_DISTANCE) {
    return { state: { ...base, refDist: dist }, zoom: undefined }
  }
  const factor = dist / s.refDist
  if (Math.abs(factor - 1) < ZOOM_MIN_CHANGE) return { state: base, zoom: undefined }
  return { state: { ...base, refDist: dist }, zoom: { factor, cx: (l.x + r.x) / 2, cy: (l.y + r.y) / 2 } }
}

export function stepTwoHands(s: TwoHandsState, input: TwoHandsInput): TwoHandsResult {
  const { left, right, t } = input
  const suppress = s.active
  if (left?.holding && right?.holding) return { ...stepBoth(s, left, right), suppress, ended: false }
  if (!s.active) return { state: s, zoom: undefined, suppress, ended: false }
  const graceSince = s.graceSince ?? t
  if (t - graceSince >= ZOOM_END_GRACE_MS) return { state: initialTwoHands(), zoom: undefined, suppress, ended: true }
  return { state: { active: true, refDist: undefined, graceSince }, zoom: undefined, suppress, ended: false }
}
