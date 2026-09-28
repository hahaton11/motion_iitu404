import { describe, expect, it } from 'vitest'
import type { Pose } from './model'
import { initialVoter, stepVoter, type VoterState } from './voter'

const feed = (poses: readonly (Pose | [Pose, number])[], from: VoterState = initialVoter()): VoterState =>
  poses.reduce((s, p) => stepVoter(s, Array.isArray(p) ? { label: p[0], confidence: p[1] } : { label: p, confidence: 1 }), from)

describe('stepVoter', () => {
  it('becomes stable after 4 of 6 frames', () => {
    expect(feed(['fist', 'fist', 'fist']).stable).toBe('idle')
    expect(feed(['fist', 'fist', 'fist', 'fist']).stable).toBe('fist')
  })

  it('ignores a single noisy frame', () => {
    const s = feed(['fist', 'fist', 'fist', 'fist', 'fist', 'fist'])
    expect(feed(['open', 'fist'], s).stable).toBe('fist')
  })

  it('keeps the previous pose when nothing has a majority', () => {
    const s = feed(['fist', 'fist', 'fist', 'fist', 'fist', 'fist'])
    expect(feed(['open', 'idle', 'point', 'open', 'idle', 'point'], s).stable).toBe('fist')
  })

  it('counts low confidence frames as idle', () => {
    expect(feed(Array.from({ length: 6 }, (): [Pose, number] => ['fist', 0.5])).stable).toBe('idle')
  })
})
