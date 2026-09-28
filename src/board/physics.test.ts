import { describe, expect, it } from 'vitest'
import {
  FOLLOW_TAU_MS,
  THROW_MAX_MS,
  THROW_MIN_MS,
  THROW_OVERSHOOT_PX,
  TILT_MAX_DEG,
  followStep,
  smoothing,
  throwPath,
  tiltStep,
  tiltTarget,
} from './physics'

const vp = { w: 1000, h: 800 }

describe('followStep', () => {
  it('moves part of the way and never overshoots', () => {
    const p = followStep({ x: 0, y: 0 }, { x: 100, y: -50 }, 16)
    expect(p.x).toBeGreaterThan(0)
    expect(p.x).toBeLessThan(100)
    expect(p.y).toBeLessThan(0)
    expect(p.y).toBeGreaterThan(-50)
  })

  it('is frame-rate independent', () => {
    const two = followStep(followStep({ x: 0, y: 0 }, { x: 100, y: 0 }, 8), { x: 100, y: 0 }, 8)
    const one = followStep({ x: 0, y: 0 }, { x: 100, y: 0 }, 16)
    expect(two.x).toBeCloseTo(one.x)
  })

  it('covers about 63% of the gap after one time constant', () => {
    expect(followStep({ x: 0, y: 0 }, { x: 100, y: 0 }, FOLLOW_TAU_MS).x).toBeCloseTo(63.2, 0)
  })

  it('zero dt keeps the position', () => {
    expect(smoothing(0, 50)).toBe(0)
    expect(smoothing(-5, 50)).toBe(0)
  })
})

describe('tilt', () => {
  it('leans in the direction of motion and is clamped', () => {
    expect(tiltTarget(200)).toBeGreaterThan(0)
    expect(tiltTarget(-200)).toBeLessThan(0)
    expect(tiltTarget(1e6)).toBe(TILT_MAX_DEG)
    expect(tiltTarget(-1e6)).toBe(-TILT_MAX_DEG)
  })

  it('eases towards the target', () => {
    const t = tiltStep(0, 1e6, 16)
    expect(t).toBeGreaterThan(0)
    expect(t).toBeLessThan(TILT_MAX_DEG)
  })
})

describe('throwPath', () => {
  it('flies along the velocity until past the screen edge', () => {
    const p = throwPath({ x: 500, y: 400 }, 3000, 0, vp)
    expect(p.dx).toBeCloseTo(500 + THROW_OVERSHOOT_PX)
    expect(p.dy).toBeCloseTo(0)
    expect(p.spinDeg).toBeGreaterThan(0)
  })

  it('exits through the nearest edge on diagonals', () => {
    const p = throwPath({ x: 900, y: 400 }, 1000, -1000, vp)
    const end = { x: 900 + p.dx, y: 400 + p.dy }
    expect(end.x).toBeGreaterThan(vp.w)
  })

  it('spins against the direction when thrown left', () => {
    expect(throwPath({ x: 500, y: 400 }, -3000, 0, vp).spinDeg).toBeLessThan(0)
  })

  it('duration is clamped', () => {
    expect(throwPath({ x: 500, y: 400 }, 1e7, 0, vp).durationMs).toBe(THROW_MIN_MS)
    expect(throwPath({ x: 500, y: 400 }, 10, 0, vp).durationMs).toBe(THROW_MAX_MS)
    expect(throwPath({ x: 500, y: 400 }, 0, 0, vp).durationMs).toBe(THROW_MAX_MS)
  })
})
