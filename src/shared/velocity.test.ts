import { describe, expect, it } from 'vitest'
import { VelocityTracker, speedOf } from './velocity'

describe('VelocityTracker', () => {
  it('returns zero for a single sample', () => {
    expect(VelocityTracker.empty().push(0.5, 0.5, 0).velocity()).toEqual({ vx: 0, vy: 0 })
  })

  it('computes velocity in screen fractions per second', () => {
    const v = VelocityTracker.empty().push(0, 0, 0).push(0.1, 0, 50).velocity()
    expect(v.vx).toBeCloseTo(2)
    expect(v.vy).toBeCloseTo(0)
  })

  it('drops samples older than the window', () => {
    const v = VelocityTracker.empty().push(0, 0, 0).push(0.5, 0, 200).push(0.6, 0, 250).velocity()
    expect(v.vx).toBeCloseTo(2)
  })

  it('does not mutate the previous tracker', () => {
    const a = VelocityTracker.empty().push(0, 0, 0)
    a.push(1, 0, 10)
    expect(a.velocity()).toEqual({ vx: 0, vy: 0 })
  })

  it('speedOf returns vector length', () => {
    expect(speedOf({ vx: 3, vy: 4 })).toBe(5)
  })
})
