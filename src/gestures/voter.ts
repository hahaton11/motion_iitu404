import type { Pose, RawPose } from './model'

/**
 * Сглаживание позы по кадрам. Поза становится устойчивой, если победила в need кадрах из последних
 * window с уверенностью не ниже threshold. Если ни одна поза не набрала голосов, остаётся прежняя:
 * один смазанный кадр не роняет элемент и не нажимает кнопку.
 */

export const VOTE_WINDOW = 6
export const VOTE_NEED = 4
export const VOTE_THRESHOLD = 0.75

export interface VoterState {
  readonly history: readonly Pose[]
  readonly stable: Pose
}

export const initialVoter = (): VoterState => ({ history: [], stable: 'idle' })

export function stepVoter(
  s: VoterState,
  raw: RawPose,
  window = VOTE_WINDOW,
  need = VOTE_NEED,
  threshold = VOTE_THRESHOLD,
): VoterState {
  const vote: Pose = raw.confidence >= threshold ? raw.label : 'idle'
  const history = [...s.history, vote].slice(-window)
  const counts = new Map<Pose, number>()
  history.forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1))
  let stable = s.stable
  let best = need - 1
  counts.forEach((n, p) => {
    if (n > best) {
      best = n
      stable = p
    }
  })
  return { history, stable }
}
