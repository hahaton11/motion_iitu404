import { describe, expect, it } from 'vitest'
import { PINCH_ZOOM_DEAD_ZONE } from './constants'
import { initialPinchZoom, isPinchZooming, stepPinchZoom, type PinchZoomInput, type PinchZoomState } from './pinch-zoom'

const CURSOR = { x: 0.4, y: 0.6 }

const frame = (x: number, y: number, o: Partial<PinchZoomInput> = {}): PinchZoomInput => ({
  active: true,
  steady: true,
  p: { x, y },
  cursor: CURSOR,
  ...o,
})

const run = (inputs: readonly PinchZoomInput[]) => {
  let s: PinchZoomState = initialPinchZoom()
  const sideways: boolean[] = []
  const zooms = inputs.map((i) => {
    const r = stepPinchZoom(s, i)
    s = r.state
    sideways.push(r.sideways === true)
    return r.zoom
  })
  return { zooms, sideways, state: s }
}

const product = (zs: ReturnType<typeof run>['zooms']): number => zs.reduce((a, z) => a * (z?.factor ?? 1), 1)

describe('stepPinchZoom', () => {
  it('first active frame only sets the anchor: no jump at the start', () => {
    const r = run([frame(0.5, 0.5)])
    expect(r.zooms).toEqual([undefined])
    expect(isPinchZooming(r.state)).toBe(true)
  })

  it('zooms in when the hand goes up and out when it goes down', () => {
    expect(run([frame(0.5, 0.5), frame(0.5, 0.45)]).zooms[1]!.factor).toBeGreaterThan(1)
    expect(run([frame(0.5, 0.5), frame(0.5, 0.55)]).zooms[1]!.factor).toBeLessThan(1)
  })

  it('up and down by the same distance give reciprocal factors', () => {
    const up = run([frame(0.5, 0.5), frame(0.5, 0.4)]).zooms[1]!.factor
    const down = run([frame(0.5, 0.5), frame(0.5, 0.6)]).zooms[1]!.factor
    expect(up * down).toBeCloseTo(1, 10)
  })

  it('zooms around the cursor at the moment the pinch closed', () => {
    const r = run([frame(0.5, 0.5), frame(0.5, 0.45, { cursor: { x: 0.9, y: 0.9 } })])
    expect(r.zooms[1]).toMatchObject({ cx: CURSOR.x, cy: CURSOR.y })
  })

  it('ignores jitter below the dead zone but keeps the anchor, so slow motion is not lost', () => {
    const tiny = PINCH_ZOOM_DEAD_ZONE * 0.6
    const r = run([frame(0.5, 0.5), frame(0.5, 0.5 - tiny), frame(0.5, 0.5 - 2 * tiny)])
    expect(r.zooms[1]).toBeUndefined()
    expect(r.zooms[2]!.factor).toBeGreaterThan(1)
  })

  it('does not zoom on a sideways move and says so, for the hint', () => {
    const r = run([frame(0.5, 0.5), ...Array.from({ length: 10 }, (_, i) => frame(0.5 + (i + 1) * 0.02, 0.5 + (i % 2) * 0.005))])
    expect(product(r.zooms)).toBe(1)
    expect(r.sideways.filter(Boolean).length).toBeGreaterThan(0)
  })

  /** Ход вверх — это зум, а не «вбок»: иначе подсказка вылетала бы посреди нормального жеста. */
  it('a vertical move is never reported as sideways', () => {
    const r = run([frame(0.5, 0.5), frame(0.5, 0.42), frame(0.5, 0.34)])
    expect(r.sideways).toEqual([false, false, false])
  })

  it('does not move on frames where the raw pose is not a pinch', () => {
    expect(run([frame(0.5, 0.5), frame(0.5, 0.4, { steady: false })]).zooms[1]).toBeUndefined()
  })

  it('stops and forgets the anchor when the pinch opens', () => {
    const r = run([frame(0.5, 0.5), frame(0.5, 0.45), frame(0.5, 0.4, { active: false }), frame(0.5, 0.3)])
    expect(r.zooms[2]).toBeUndefined()
    expect(r.zooms[3]).toBeUndefined()
  })
})
