import { describe, expect, it } from 'vitest'
import { initialTwoHands, stepTwoHands, type HandSnapshot, type TwoHandsResult, type TwoHandsState } from './two-hands'

const FRAME_MS = 1000 / 30

const hold = (x: number, y = 0.5): HandSnapshot => ({ x, y, holding: true })
const open = (x: number, y = 0.5): HandSnapshot => ({ x, y, holding: false })

type Pair = readonly [HandSnapshot | undefined, HandSnapshot | undefined]

const run = (pairs: readonly Pair[], start: TwoHandsState = initialTwoHands()): TwoHandsResult[] => {
  let s = start
  return pairs.map(([left, right], i) => {
    const r = stepTwoHands(s, { t: i * FRAME_MS, left, right })
    s = r.state
    return r
  })
}

describe('stepTwoHands zoom', () => {
  it('does nothing unless both hands hold', () => {
    const rs = run([
      [hold(0.3), open(0.7)],
      [hold(0.2), open(0.8)],
      [hold(0.2), undefined],
    ])
    expect(rs.every((r) => !r.zoom && !r.state.active)).toBe(true)
  })

  it('emits factor as the ratio of distances between frames', () => {
    const rs = run([
      [hold(0.4), hold(0.6)],
      [hold(0.3), hold(0.7)],
      [hold(0.2), hold(0.8)],
    ])
    expect(rs[0]!.zoom).toBeUndefined()
    expect(rs[1]!.zoom?.factor).toBeCloseTo(2)
    expect(rs[2]!.zoom?.factor).toBeCloseTo(1.5)
    expect(rs[2]!.zoom?.cx).toBeCloseTo(0.5)
  })

  it('ignores changes below 0.5% but accumulates them', () => {
    const d = [0.4, 0.401, 0.4015, 0.403]
    const rs = run(d.map((dist) => [hold(0.5 - dist / 2), hold(0.5 + dist / 2)] as const))
    expect(rs.slice(1, 3).every((r) => !r.zoom)).toBe(true)
    expect(rs[3]!.zoom?.factor).toBeCloseTo(0.403 / 0.4)
  })
})

describe('stepTwoHands session', () => {
  it('suppresses hand events after the session started, not on the first frame', () => {
    const rs = run([
      [hold(0.3), hold(0.7)],
      [hold(0.3), hold(0.7)],
    ])
    expect(rs.map((r) => r.suppress)).toEqual([false, true])
  })

  it('absorbs a short flicker of one hand out of holding', () => {
    const rs = run([
      [hold(0.3), hold(0.7)],
      [open(0.3), hold(0.7)],
      [open(0.3), hold(0.7)],
      [hold(0.3), hold(0.7)],
    ])
    expect(rs.some((r) => r.ended)).toBe(false)
    expect(rs[3]!.state.active).toBe(true)
  })

  it('ends after the grace period and reports it once', () => {
    const pairs: Pair[] = [[hold(0.3), hold(0.7)], ...Array<Pair>(12).fill([open(0.3), hold(0.7)])]
    const rs = run(pairs)
    expect(rs.filter((r) => r.ended)).toHaveLength(1)
    expect(rs[rs.length - 1]!.state.active).toBe(false)
  })

  it('does not zoom from a stale distance after a flicker', () => {
    const rs = run([
      [hold(0.4), hold(0.6)],
      [open(0.4), hold(0.6)],
      [hold(0.1), hold(0.9)],
    ])
    expect(rs[2]!.zoom).toBeUndefined()
  })
})
