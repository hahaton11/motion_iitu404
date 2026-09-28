import { describe, expect, it } from 'vitest'
import { DEFAULT_POINTER, boxAround, boxToScreen, initialPointer, leash, stepPointer, type PointerState } from './pointer'

const FREE = { holding: false, transitioning: false }
const DT = 33

/** Прогоняет последовательность сырых точек кадра, возвращает последнее состояние и выходы. */
function run(points: readonly { x: number; y: number }[], ctx = FREE, from: PointerState = initialPointer(), t0 = 0) {
  let s = from
  const out: { x: number; y: number }[] = []
  points.forEach((p, i) => {
    const r = stepPointer(s, p, t0 + i * DT, ctx)
    s = r.state
    out.push(r.screen)
  })
  return { s, out, tEnd: t0 + (points.length - 1) * DT }
}

describe('boxToScreen', () => {
  it('maps the working box onto the whole screen and mirrors x', () => {
    const box = { cx: 0.5, cy: 0.5, w: 0.5, h: 0.5 }
    expect(boxToScreen({ x: 0.75, y: 0.25 }, box)).toEqual({ x: 0, y: 0 })
    expect(boxToScreen({ x: 0.25, y: 0.75 }, box)).toEqual({ x: 1, y: 1 })
    expect(boxToScreen({ x: 0.5, y: 0.5 }, box)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('clamps points outside the box to the screen edge', () => {
    expect(boxToScreen({ x: 0.95, y: 0.02 })).toEqual({ x: 0, y: 0 })
  })

  it('keeps a box near the frame edge inside the frame', () => {
    const box = { cx: 0.05, cy: 0.5, w: 0.5, h: 0.5 }
    expect(boxToScreen({ x: 1, y: 0.5 }, box).x).toBe(0)
  })
})

describe('boxAround', () => {
  it('centres the box on a frame point in mirrored coordinates', () => {
    const box = boxAround({ x: 0.3, y: 0.6 })
    expect(box.cx).toBeCloseTo(0.7)
    expect(box.cy).toBeCloseTo(0.6)
    expect(boxToScreen({ x: 0.3, y: 0.6 }, box)).toEqual({ x: 0.5, y: 0.5 })
  })
})

describe('leash', () => {
  it('ignores movement inside the radius', () => {
    expect(leash({ x: 0.5, y: 0.5 }, { x: 0.502, y: 0.5 }, 0.003)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('follows the target keeping the radius distance', () => {
    const r = leash({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, 0.01)
    expect(r.x).toBeCloseTo(0.59)
  })
})

describe('stepPointer', () => {
  it('does not move on sub-millimetre jitter', () => {
    const jitter = Array.from({ length: 60 }, (_, i) => ({ x: 0.5 + (i % 2 ? 0.0015 : -0.0015), y: 0.5 }))
    const { out } = run(jitter)
    const xs = out.slice(10).map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.002)
  })

  it('reaches a far target when the hand moves steadily', () => {
    const path = Array.from({ length: 40 }, (_, i) => ({ x: 0.5 - Math.min(i, 20) * 0.01, y: 0.5 }))
    const { out } = run(path)
    expect(out[out.length - 1]!.x).toBeGreaterThan(0.85)
  })

  it('holds still while the fist is closing, then continues without a jump', () => {
    const still = run(Array.from({ length: 20 }, () => ({ x: 0.5, y: 0.5 })))
    const frozenAt = still.out[still.out.length - 1]!
    // При сжатии кулака центр ладони уезжает вниз на 3% кадра.
    const closing = run(Array.from({ length: 5 }, () => ({ x: 0.5, y: 0.53 })), { holding: false, transitioning: true }, still.s, still.tEnd + DT)
    closing.out.forEach((p) => expect(p).toEqual(frozenAt))
    const held = run(Array.from({ length: 20 }, () => ({ x: 0.5, y: 0.53 })), { holding: true, transitioning: false }, closing.s, closing.tEnd + DT)
    const last = held.out[held.out.length - 1]!
    expect(Math.abs(last.y - frozenAt.y)).toBeLessThan(0.01)
  })

  it('stops freezing after the maximum freeze time', () => {
    const still = run(Array.from({ length: 10 }, () => ({ x: 0.5, y: 0.5 })))
    const moving = Array.from({ length: 30 }, (_, i) => ({ x: 0.5 - i * 0.01, y: 0.5 }))
    const r = run(moving, { holding: false, transitioning: true }, still.s, still.tEnd + DT)
    expect(DEFAULT_POINTER.freezeMaxMs).toBeLessThan(30 * DT)
    expect(r.out[r.out.length - 1]!.x).toBeGreaterThan(0.6)
  })

  it('bleeds the freeze offset away as the hand moves', () => {
    const still = run(Array.from({ length: 10 }, () => ({ x: 0.5, y: 0.5 })))
    const closing = run([{ x: 0.5, y: 0.55 }], { holding: false, transitioning: true }, still.s, still.tEnd + DT)
    const after = run(Array.from({ length: 30 }, (_, i) => ({ x: 0.5 - i * 0.01, y: 0.55 })), FREE, closing.s, closing.tEnd + DT)
    expect(Math.abs(after.s.offset.y)).toBeLessThan(0.02)
  })
})
