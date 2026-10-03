import { describe, expect, it } from 'vitest'
import type { CursorEvt, ZoomEvt } from '../contracts/input'
import type { Pose } from '../gestures/model'
import { gestureEventTypes } from './fixtures'
import { initialPipeline, processFrame, type OutEvent, type PipelineState } from './pipeline'
import { POSES, syntheticHand } from './testing/synthetic-hand'

const FRAME_MS = 1000 / 30

/** Кадр: поза классификатора, уверенность, x и y запястья в кадре (не зеркальный). */
type F = readonly [Pose, number, number, number]

const hand = ([label, confidence, x, y]: F) => ({
  ...syntheticHand(POSES.open, { hand: 'right', wrist: { x, y } }),
  pose: { label, confidence },
})

const run = (frames: readonly F[]) => {
  let state: PipelineState = initialPipeline()
  const perFrame: OutEvent[][] = []
  frames.forEach((f, i) => {
    const r = processFrame(state, { t: i * FRAME_MS, hands: [hand(f)] })
    state = r.state
    perFrame.push([...r.events])
  })
  return perFrame
}

const zooms = (events: readonly OutEvent[]): ZoomEvt[] => events.flatMap((e) => (e.type === 'zoom' ? [e.e] : []))
const cursors = (events: readonly OutEvent[]): CursorEvt[] => events.flatMap((e) => (e.type === 'cursor' ? [e.e] : []))
const hints = (events: readonly OutEvent[]) => events.flatMap((e) => (e.type === 'hint' ? [e.e.code] : []))
const product = (zs: readonly ZoomEvt[]): number => zs.reduce((a, z) => a * z.factor, 1)

const Y0 = 0.75
const still = (label: Pose, k: number, y = Y0, conf = 0.95, x = 0.5): F[] => Array.from({ length: k }, () => [label, conf, x, y] as const)
/** Рука идёт по кадру по вертикали из from с шагом step за кадр. */
const vertical = (label: Pose, k: number, from: number, step: number): F[] =>
  Array.from({ length: k }, (_, i) => [label, 0.95, 0.5, from + i * step] as const)
const sideways = (label: Pose, k: number, from: number, step: number): F[] =>
  Array.from({ length: k }, (_, i) => [label, 0.95, from + i * step, Y0] as const)

describe('processFrame: one-hand pinch zoom', () => {
  it('zooms in when the pinched hand goes up', () => {
    const frames = run([...still('open', 6), ...still('pinch', 6), ...vertical('pinch', 15, Y0, -0.004)])
    const zs = zooms(frames.flat())
    expect(zs.length).toBeGreaterThan(5)
    expect(zs.every((z) => z.factor > 1)).toBe(true)
  })

  it('zooms out when the pinched hand goes down', () => {
    const frames = run([...still('open', 6), ...still('pinch', 6), ...vertical('pinch', 15, Y0, 0.004)])
    const zs = zooms(frames.flat())
    expect(zs.length).toBeGreaterThan(5)
    expect(zs.every((z) => z.factor < 1)).toBe(true)
  })

  it('up and back down to the same place restores the scale', () => {
    const up = vertical('pinch', 15, Y0, -0.004)
    const down = vertical('pinch', 16, Y0 - 0.06, 0.004)
    const frames = run([...still('open', 6), ...still('pinch', 6), ...up, ...down, ...still('pinch', 15)])
    expect(product(zooms(frames.flat()))).toBeCloseTo(1, 1)
  })

  it('sends no zoom while the pinch is held without moving', () => {
    expect(zooms(run([...still('open', 6), ...still('pinch', 40)]).flat())).toEqual([])
  })

  it('does not jump at the start: movement before the pinch is not zoomed', () => {
    const before = [...still('open', 6), ...vertical('open', 10, Y0, -0.01)]
    const atStop = before[before.length - 1]![3]
    expect(zooms(run([...before, ...still('pinch', 20, atStop)]).flat())).toEqual([])
  })

  it('first zoom step is one frame of motion, not an accumulated jump', () => {
    const frames = run([...still('open', 6), ...vertical('open', 6, Y0, -0.006), ...vertical('pinch', 12, Y0 - 0.036, -0.006)])
    const first = zooms(frames.flat())[0]!
    // Шаг руки 0.006 кадра = 0.012 экрана, exp(0.012 * 2.5) ≈ 1.03.
    expect(first.factor).toBeLessThan(1.08)
  })

  it('a sideways move with the pinch tilts and nothing else: no zoom, no pan, no grab', () => {
    const frames = run([...still('open', 6), ...still('pinch', 6), ...sideways('pinch', 20, 0.5, -0.005)])
    expect(new Set(gestureEventTypes(frames.flat()))).toEqual(new Set(['tilt']))
  })

  /*
   * Наклон проверяется на всём конвейере, а не только в чистой функции: величина идёт
   * от stepPinchZoom через кадр жестов в события контракта, и разрыв в этой цепочке выглядел бы
   * ровно как отсутствие жеста.
   */
  it('a sideways pinch sends tilt events and no zoom', () => {
    const frames = run([...still('open', 6), ...still('pinch', 6), ...sideways('pinch', 30, 0.5, -0.005)])
    const tilts = frames.flat().flatMap((e) => (e.type === 'tilt' ? [e.e] : []))
    expect(tilts.length).toBeGreaterThan(3)
    expect(zooms(frames.flat())).toEqual([])
    expect(tilts.every((t) => t.hand === 'right')).toBe(true)
    // Рука идёт в одну сторону: все приращения одного знака, доска кренится, а не дрожит.
    expect(new Set(tilts.map((t) => Math.sign(t.delta))).size).toBe(1)
  })

  it('a vertical pinch sends no tilt', () => {
    const frames = run([...still('open', 6), ...still('pinch', 6), ...vertical('pinch', 15, Y0, -0.004)])
    expect(frames.flat().filter((e) => e.type === 'tilt')).toEqual([])
  })

  it('zooms around the cursor where the pinch closed, which stays put and is marked zooming', () => {
    const frames = run([...still('open', 6), ...still('pinch', 6), ...vertical('pinch', 15, Y0, -0.004)])
    const before = cursors(frames.slice(0, 6).flat()).pop()!
    const zs = zooms(frames.flat())
    expect(zs[0]!.cx).toBeCloseTo(before.x, 2)
    expect(zs[0]!.cy).toBeCloseTo(before.y, 2)
    const during = cursors(frames.slice(14).flat())
    expect(during.every((c) => c.zooming === true)).toBe(true)
    const ys = during.map((c) => c.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.005)
  })

  it('stops when the pinch opens and the cursor resumes without a jump', () => {
    const gesture = [...still('open', 6), ...still('pinch', 6), ...vertical('pinch', 15, Y0, -0.004)]
    const after = still('open', 15, Y0 - 0.06)
    const frames = run([...gesture, ...after])
    expect(zooms(frames.slice(gesture.length + 1).flat())).toEqual([])
    const cs = cursors(frames.flat())
    expect(cs[cs.length - 1]!.zooming).toBe(false)
    const steps = cs.slice(1).map((c, i) => Math.abs(c.y - cs[i]!.y))
    expect(Math.max(...steps)).toBeLessThan(0.03)
  })

  it('a fast pinched move is a zoom, not a swipe', () => {
    const frames = run([...still('open', 6), ...still('pinch', 6), ...vertical('pinch', 8, Y0, -0.02), ...still('pinch', 10, Y0 - 0.16)])
    expect(gestureEventTypes(frames.flat()).filter((t) => t !== 'zoom')).toEqual([])
  })

  it('the fist grabs, the pinch over the same place does not', () => {
    const fist = run([...still('open', 6), ...still('fist', 10)])
    const pinch = run([...still('open', 6), ...still('pinch', 10)])
    expect(gestureEventTypes(fist.flat())).toEqual(['grab'])
    expect(gestureEventTypes(pinch.flat())).toEqual([])
  })

  it('a hand carrying an element does not zoom when the fist turns into a pinch', () => {
    const frames = run([...still('open', 6), ...still('fist', 8), ...vertical('pinch', 15, Y0, -0.004), ...still('open', 8, Y0 - 0.06)])
    const types = gestureEventTypes(frames.flat())
    expect(types).toEqual(['grab', 'release'])
  })
})

describe('processFrame: pinch next to the other hand', () => {
  const pair = (right: F, left: F) => [hand(right), { ...hand(left), hand: 'left' as const }]
  const runPair = (frames: readonly (readonly [F, F])[]) => {
    let state: PipelineState = initialPipeline()
    return frames.flatMap(([r, l], i) => {
      const out = processFrame(state, { t: i * FRAME_MS, hands: pair(r, l) })
      state = out.state
      return out.events
    })
  }

  it('one hand pinch-zooms while the other holds a fist: no two-hand zoom, the fist still grabs', () => {
    const lefts = [...still('open', 6, Y0, 0.95, 0.8), ...still('fist', 21, Y0, 0.95, 0.8)]
    const rights = [...still('open', 6, Y0, 0.95, 0.2), ...still('pinch', 6, Y0, 0.95, 0.2), ...vertical('pinch', 15, Y0, -0.004).map(([p, c, , y]) => [p, c, 0.2, y] as const)]
    const events = runPair(rights.map((r, i) => [r, lefts[i]!] as const))
    expect(gestureEventTypes(events).filter((t) => t !== 'zoom')).toEqual(['grab'])
    const zs = zooms(events)
    expect(zs.length).toBeGreaterThan(5)
    expect(zs.every((z) => z.factor > 1)).toBe(true)
  })
})

describe('processFrame: near-miss pinch', () => {
  it('asks to close the pinch when it is seen without confidence', () => {
    const frames = run([...still('open', 6), ...still('pinch', 30, Y0, 0.6)])
    expect(hints(frames.flat())).toContain('HALF_PINCH')
    expect(zooms(frames.flat())).toEqual([])
  })

  it('stays quiet for a confident pinch', () => {
    expect(hints(run([...still('open', 6), ...still('pinch', 40)]).flat())).toEqual([])
  })
})
