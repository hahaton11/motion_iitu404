import { describe, expect, it } from 'vitest'
import { DEFAULT_POINTER, gainFor, initialPointer, leash, stepPointer, type PointerContext, type PointerState } from './pointer'

const ENGAGED: PointerContext = { engaged: true, holding: false, transitioning: false }
const IDLE: PointerContext = { engaged: false, holding: false, transitioning: false }
const DT = 33

function run(points: readonly { x: number; y: number }[], ctx: PointerContext, from: PointerState = initialPointer(), t0 = 0) {
  let s = from
  const out: { x: number; y: number }[] = []
  points.forEach((p, i) => {
    const r = stepPointer(s, p, t0 + i * DT, ctx)
    s = r.state
    out.push(r.screen)
  })
  return { s, out, last: out[out.length - 1]!, tEnd: t0 + (points.length - 1) * DT }
}

const still = (n: number, x = 0.5, y = 0.5) => Array.from({ length: n }, () => ({ x, y }))
/** Рука едет влево в кадре, то есть вправо на зеркальном экране. */
const sweep = (n: number, step: number, x0 = 0.5) => Array.from({ length: n }, (_, i) => ({ x: x0 - i * step, y: 0.5 }))

describe('leash', () => {
  it('ignores movement inside the radius', () => {
    expect(leash({ x: 0.5, y: 0.5 }, { x: 0.501, y: 0.5 }, 0.002)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('follows keeping the radius distance', () => {
    expect(leash({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, 0.01).x).toBeCloseTo(0.59)
  })
})

describe('gainFor', () => {
  it('grows with speed between min and max', () => {
    expect(gainFor(0)).toBe(DEFAULT_POINTER.gainMin)
    expect(gainFor(10)).toBe(DEFAULT_POINTER.gainMax)
    expect(gainFor(0.5)).toBeGreaterThan(gainFor(0.2))
  })
})

describe('stepPointer', () => {
  it('starts in the centre of the screen', () => {
    expect(run(still(3), ENGAGED).last).toEqual({ x: 0.5, y: 0.5 })
  })

  it('moves relative to the hand while engaged, mirrored', () => {
    const r = run(sweep(20, 0.005), ENGAGED)
    expect(r.last.x).toBeGreaterThan(0.6)
    expect(r.last.y).toBeCloseTo(0.5)
  })

  it('does not move while the clutch is off, wherever the hand is', () => {
    const r = run([...still(5), ...sweep(20, 0.01)], IDLE)
    expect(r.last).toEqual({ x: 0.5, y: 0.5 })
  })

  it('continues from where it stopped when the clutch is re-engaged', () => {
    const a = run(sweep(20, 0.005), ENGAGED)
    const idle = run(sweep(20, -0.01, 0.4), IDLE, a.s, a.tEnd + DT)
    expect(idle.last).toEqual(a.last)
    const settle = run(still(10, 0.59), IDLE, idle.s, idle.tEnd + DT)
    const b = run(still(5, 0.59), ENGAGED, settle.s, settle.tEnd + DT)
    expect(Math.abs(b.last.x - a.last.x)).toBeLessThan(0.005)
  })

  it('moves further for the same distance when the hand moves fast', () => {
    const slow = run(sweep(40, 0.0025), ENGAGED)
    const fast = run(sweep(10, 0.01), ENGAGED)
    expect(fast.last.x - 0.5).toBeGreaterThan(slow.last.x - 0.5)
  })

  it('ignores sub-millimetre jitter', () => {
    const jitter = Array.from({ length: 60 }, (_, i) => ({ x: 0.5 + (i % 2 ? 0.001 : -0.001), y: 0.5 }))
    const xs = run(jitter, ENGAGED).out.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.002)
  })

  it('freezes while the pinch is closing, then does not jump', () => {
    const a = run(still(10), ENGAGED)
    const closing = run(still(4, 0.5, 0.53), { engaged: true, holding: false, transitioning: true }, a.s, a.tEnd + DT)
    closing.out.forEach((p) => expect(p).toEqual(a.last))
    const held = run(still(10, 0.5, 0.53), { engaged: true, holding: true, transitioning: false }, closing.s, closing.tEnd + DT)
    expect(Math.abs(held.last.y - a.last.y)).toBeLessThan(0.01)
  })

  it('stops freezing after the maximum freeze time', () => {
    const a = run(still(5), ENGAGED)
    const r = run(sweep(30, 0.005), { engaged: true, holding: false, transitioning: true }, a.s, a.tEnd + DT)
    expect(r.last.x).toBeGreaterThan(0.55)
  })

  it('clamps to the screen', () => {
    expect(run(sweep(40, 0.03), ENGAGED).last.x).toBe(1)
  })
})
