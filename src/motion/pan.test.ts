import { describe, expect, it } from 'vitest'
import { PAN_MIN_STEP } from './constants'
import { initialPan, stepPan, type PanInput, type PanState } from './pan'

const frame = (x: number, y: number, o: Partial<PanInput> = {}): PanInput => ({ active: true, steady: true, p: { x, y }, ...o })

const run = (inputs: readonly PanInput[]) => {
  let s: PanState = initialPan()
  return inputs.map((i) => {
    const r = stepPan(s, i)
    s = r.state
    return r.delta
  })
}

describe('stepPan', () => {
  it('first active frame only sets the anchor: no jump at the start', () => {
    expect(run([frame(0.2, 0.2)])).toEqual([undefined])
  })

  it('emits the hand displacement since the previous emitted frame', () => {
    const d = run([frame(0.2, 0.2), frame(0.25, 0.22), frame(0.3, 0.2)])
    expect(d[1]?.x).toBeCloseTo(0.05)
    expect(d[1]?.y).toBeCloseTo(0.02)
    expect(d[2]?.x).toBeCloseTo(0.05)
    expect(d[2]?.y).toBeCloseTo(-0.02)
  })

  it('ignores jitter below the dead zone but keeps the anchor, so slow motion is not lost', () => {
    const tiny = PAN_MIN_STEP * 0.6
    const d = run([frame(0.5, 0.5), frame(0.5 + tiny, 0.5), frame(0.5 + 2 * tiny, 0.5)])
    expect(d[1]).toBeUndefined()
    expect(d[2]?.x).toBeCloseTo(2 * tiny)
  })

  it('inactive frame ends the pan, the next start sets a fresh anchor', () => {
    const d = run([frame(0.2, 0.2), frame(0.3, 0.2), frame(0.6, 0.6, { active: false }), frame(0.7, 0.7), frame(0.72, 0.7)])
    expect(d[2]).toBeUndefined()
    expect(d[3]).toBeUndefined()
    expect(d[4]?.x).toBeCloseTo(0.02)
  })

  it('unsteady frames hold the anchor and emit nothing', () => {
    const d = run([frame(0.2, 0.2), frame(0.3, 0.2, { steady: false }), frame(0.32, 0.2)])
    expect(d[1]).toBeUndefined()
    expect(d[2]?.x).toBeCloseTo(0.12)
  })

  it('reports whether the hand is panning', () => {
    let s = initialPan()
    expect(stepPan(s, frame(0.2, 0.2, { active: false })).state.anchor).toBeUndefined()
    s = stepPan(s, frame(0.2, 0.2)).state
    expect(s.anchor).toEqual({ x: 0.2, y: 0.2 })
  })
})
