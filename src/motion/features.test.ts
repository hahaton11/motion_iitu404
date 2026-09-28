import { describe, expect, it } from 'vitest'
import { angleBetween, computeFeatures, fingerCurls, palmSize } from './features'
import { POSES, syntheticHand, worldPose } from './testing/synthetic-hand'
import type { Landmarks } from './types'

const rotate = (lm: Landmarks, a: number): Landmarks =>
  lm.map((p) => ({ x: p.x * Math.cos(a) - p.z * Math.sin(a), y: p.y, z: p.x * Math.sin(a) + p.z * Math.cos(a) }))

describe('angleBetween', () => {
  it('returns 0 for parallel and pi/2 for orthogonal vectors', () => {
    expect(angleBetween({ x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })).toBeCloseTo(0)
    expect(angleBetween({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(Math.PI / 2)
  })

  it('returns 0 for a zero vector', () => {
    expect(angleBetween({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(0)
  })
})

describe('closure', () => {
  it('is near 0 for an open palm and near 1 for a fist', () => {
    expect(computeFeatures(syntheticHand(POSES.open)).closure).toBeLessThan(0.05)
    expect(computeFeatures(syntheticHand(POSES.fist)).closure).toBeGreaterThan(0.95)
  })

  it('tracks partial curl', () => {
    expect(computeFeatures(syntheticHand(POSES.curl(0.6))).closure).toBeCloseTo(0.6, 1)
  })

  it('is monotonic in curl', () => {
    const values = [0, 0.2, 0.4, 0.6, 0.8, 1].map((c) => computeFeatures(syntheticHand(POSES.curl(c))).closure)
    values.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(values[i]!))
  })

  it('does not depend on hand rotation in world space', () => {
    const base = fingerCurls(worldPose(POSES.half))
    const rotated = fingerCurls(rotate(worldPose(POSES.half), 0.7))
    expect(rotated.middle).toBeCloseTo(base.middle)
  })
})

describe('indexOnly', () => {
  it('detects the pointing pose only', () => {
    expect(computeFeatures(syntheticHand(POSES.point)).indexOnly).toBe(true)
    expect(computeFeatures(syntheticHand(POSES.open)).indexOnly).toBe(false)
    expect(computeFeatures(syntheticHand(POSES.fist)).indexOnly).toBe(false)
    expect(computeFeatures(syntheticHand(POSES.pinch)).indexOnly).toBe(false)
  })
})

describe('palmSize', () => {
  it('grows with the hand scale in frame', () => {
    const near = palmSize(syntheticHand(POSES.open, { scale: 1.6 }).landmarks)
    const far = palmSize(syntheticHand(POSES.open, { scale: 0.4 }).landmarks)
    expect(near).toBeCloseTo(far * 4)
  })

  it('does not change when the hand closes', () => {
    const a = palmSize(syntheticHand(POSES.open).landmarks)
    const b = palmSize(syntheticHand(POSES.fist).landmarks)
    expect(a).toBeCloseTo(b)
  })
})

describe('pinch and victory', () => {
  it('pinch is 0 for an open hand and 1 when the tips touch', () => {
    expect(computeFeatures(syntheticHand(POSES.open)).pinch).toBe(0)
    expect(computeFeatures(syntheticHand(POSES.grab)).pinch).toBe(1)
  })

  it('half pinch lands between the default thresholds', () => {
    const p = computeFeatures(syntheticHand(POSES.halfPinch)).pinch
    expect(p).toBeGreaterThan(0.45)
    expect(p).toBeLessThan(0.75)
  })

  it('detects the V gesture and does not confuse it with pointing', () => {
    const v = computeFeatures(syntheticHand(POSES.victory))
    expect(v.victory).toBe(true)
    expect(v.indexOnly).toBe(false)
    const point = computeFeatures(syntheticHand(POSES.point))
    expect(point.victory).toBe(false)
    expect(point.indexOnly).toBe(true)
  })
})
