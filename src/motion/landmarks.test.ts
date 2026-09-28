import { describe, expect, it } from 'vitest'
import { assignHandIds, edgeDistance, frameToScreen, normalizeLandmarks, palmCenter, type RawHand } from './landmarks'
import { POSES, syntheticHand } from './testing/synthetic-hand'

const raw = (label: string, wristX: number): RawHand => {
  const h = syntheticHand(POSES.open, { wrist: { x: wristX, y: 0.7 } })
  return { label, score: 0.9, landmarks: h.landmarks, world: h.world }
}

describe('palmCenter', () => {
  it('averages wrist and finger bases', () => {
    const lm = Array.from({ length: 21 }, (_, i) => ({ x: i === 0 ? 1 : 0, y: i === 5 ? 1 : 0, z: 0 }))
    expect(palmCenter(lm)).toEqual({ x: 0.2, y: 0.2 })
  })

  it('barely moves when the hand closes into a fist', () => {
    const open = palmCenter(syntheticHand(POSES.open).landmarks)
    const fist = palmCenter(syntheticHand(POSES.fist).landmarks)
    expect(Math.hypot(open.x - fist.x, open.y - fist.y)).toBeLessThan(0.001)
  })
})

describe('normalizeLandmarks', () => {
  it('puts the wrist at the origin and point 9 at unit distance', () => {
    const n = normalizeLandmarks(syntheticHand(POSES.open, { wrist: { x: 0.3, y: 0.6 } }).landmarks)
    expect(n[0]).toEqual({ x: -0, y: 0, z: 0 })
    const m = n[9]!
    expect(Math.hypot(m.x, m.y, m.z)).toBeCloseTo(1)
  })

  it('is invariant to position and scale', () => {
    const a = normalizeLandmarks(syntheticHand(POSES.half, { wrist: { x: 0.2, y: 0.5 }, scale: 0.5 }).landmarks)
    const b = normalizeLandmarks(syntheticHand(POSES.half, { wrist: { x: 0.7, y: 0.8 }, scale: 1.2 }).landmarks)
    a.forEach((p, i) => expect(p.x).toBeCloseTo(b[i]!.x))
  })

  it('mirrors x', () => {
    const lm = syntheticHand(POSES.open).landmarks
    const n = normalizeLandmarks(lm)
    expect(Math.sign(n[5]!.x)).toBe(-Math.sign(lm[5]!.x - lm[0]!.x))
  })

  it('does not mutate the input', () => {
    const lm = syntheticHand(POSES.open).landmarks
    const copy = JSON.stringify(lm)
    normalizeLandmarks(lm)
    expect(JSON.stringify(lm)).toBe(copy)
  })
})

describe('frameToScreen', () => {
  it('mirrors x and keeps the center', () => {
    expect(frameToScreen({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 })
    expect(frameToScreen({ x: 0.3, y: 0.5 }).x).toBeGreaterThan(0.5)
  })

  it('stretches the dead zone to the screen edges', () => {
    expect(frameToScreen({ x: 0.92, y: 0.08 }, 0.08)).toEqual({ x: 0, y: 0 })
    const far = frameToScreen({ x: 0.08, y: 0.92 }, 0.08)
    expect(far.x).toBeCloseTo(1)
    expect(far.y).toBeCloseTo(1)
  })

  it('clamps points inside the dead zone', () => {
    expect(frameToScreen({ x: 1, y: -0.2 }, 0.08)).toEqual({ x: 0, y: 0 })
  })
})

describe('edgeDistance', () => {
  it('returns the distance to the closest edge', () => {
    expect(edgeDistance({ x: 0.5, y: 0.5 })).toBe(0.5)
    expect(edgeDistance({ x: 0.97, y: 0.5 })).toBeCloseTo(0.03)
  })
})

describe('assignHandIds', () => {
  it('swaps MediaPipe labels for an unmirrored frame', () => {
    expect(assignHandIds([raw('Left', 0.3)])[0]!.hand).toBe('right')
    expect(assignHandIds([raw('Right', 0.7)])[0]!.hand).toBe('left')
  })

  it('resolves duplicate labels by screen position', () => {
    const hands = assignHandIds([raw('Left', 0.3), raw('Left', 0.7)])
    expect(hands.map((h) => h.hand)).toEqual(['right', 'left'])
  })

  it('keeps at most two hands', () => {
    expect(assignHandIds([raw('Left', 0.2), raw('Right', 0.5), raw('Left', 0.8)])).toHaveLength(2)
  })
})
