import { describe, expect, it } from 'vitest'
import type { CursorEvt, PanEvt } from '../contracts/input'
import type { Pose } from '../gestures/model'
import { gestureEventTypes } from './fixtures'
import { initialPipeline, processFrame, type OutEvent, type PipelineState } from './pipeline'
import { POSES, syntheticHand } from './testing/synthetic-hand'

const FRAME_MS = 1000 / 30

/** Кадр: поза классификатора, уверенность и x запястья в кадре (не зеркальный). */
type F = readonly [Pose, number, number]

const hand = ([label, confidence, x]: F) => ({
  ...syntheticHand(POSES.open, { hand: 'right', wrist: { x, y: 0.75 } }),
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

const pans = (events: readonly OutEvent[]): PanEvt[] => events.flatMap((e) => (e.type === 'pan' ? [e.e] : []))
const cursors = (events: readonly OutEvent[]): CursorEvt[] => events.flatMap((e) => (e.type === 'cursor' ? [e.e] : []))
const hints = (events: readonly OutEvent[]) => events.flatMap((e) => (e.type === 'hint' ? [e.e.code] : []))
const still = (label: Pose, k: number, x = 0.5, conf = 0.95): F[] => Array.from({ length: k }, () => [label, conf, x] as const)
/** Рука идёт по кадру из from с шагом step за кадр. */
const moving = (label: Pose, k: number, from: number, step: number): F[] =>
  Array.from({ length: k }, (_, i) => [label, 0.95, from + i * step] as const)
const sumDx = (ps: readonly PanEvt[]): number => ps.reduce((a, p) => a + p.dx, 0)

describe('processFrame: two-finger pan', () => {
  it('pans the board with the hand while victory is held and the hand moves', () => {
    const frames = run([...still('open', 6), ...still('victory', 6), ...moving('victory', 15, 0.5, -0.004)])
    const ps = pans(frames.flat())
    expect(ps.length).toBeGreaterThan(5)
    // Кадр не зеркальный: запястье влево по кадру — рука вправо по экрану, доска едет вправо.
    expect(ps.every((p) => p.dx > 0 && p.hand === 'right')).toBe(true)
    expect(Math.abs(ps.reduce((a, p) => a + p.dy, 0))).toBeLessThan(0.01)
  })

  it('sends no pan while victory is held without moving', () => {
    const frames = run([...still('open', 6), ...still('victory', 40)])
    expect(pans(frames.flat())).toEqual([])
  })

  it('does not jump at the start: movement before the gesture is not panned', () => {
    // Рука уезжает раскрытой, сразу показывает два пальца и стоит: панорамы нет совсем.
    const before = [...still('open', 6), ...moving('open', 10, 0.5, -0.01)]
    const atStop = before[before.length - 1]![2]
    const frames = run([...before, ...still('victory', 20, atStop)])
    expect(pans(frames.flat())).toEqual([])
  })

  it('first pan step is a single frame of motion, not an accumulated jump', () => {
    const frames = run([...still('open', 6), ...moving('open', 6, 0.5, -0.006), ...moving('victory', 12, 0.464, -0.006)])
    const first = pans(frames.flat())[0]!
    // Шаг руки 0.006 кадра = 0.012 экрана (рабочая зона в половину кадра).
    expect(first.dx).toBeLessThan(0.03)
  })

  it('total pan follows the hand travel during the gesture', () => {
    const frames = run([...still('open', 6), ...still('victory', 6), ...moving('victory', 20, 0.5, -0.005), ...still('victory', 20, 0.405)])
    // Рука прошла 0.095 кадра = 0.19 экрана.
    expect(sumDx(pans(frames.flat()))).toBeCloseTo(0.19, 1)
  })

  it('stops cleanly when the gesture ends: no pan from the frames where the fingers fold', () => {
    const gesture = [...still('open', 6), ...still('victory', 6), ...moving('victory', 10, 0.5, -0.005)]
    const ending = moving('fist', 10, 0.45, -0.005)
    const frames = run([...gesture, ...ending])
    const tail = frames.slice(gesture.length).flat()
    expect(pans(tail)).toEqual([])
    expect(cursors(tail).pop()?.panning).toBe(false)
  })

  it('freezes the cursor and marks it as panning during the pan', () => {
    const frames = run([...still('open', 6), ...still('victory', 6), ...moving('victory', 15, 0.5, -0.005)])
    const during = cursors(frames.slice(14).flat())
    expect(during.every((c) => c.panning === true)).toBe(true)
    const xs = during.map((c) => c.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.005)
  })

  it('does not swipe while panning fast', () => {
    const frames = run([...still('open', 6), ...still('victory', 6), ...moving('victory', 8, 0.6, -0.03), ...still('victory', 10, 0.36)])
    expect(gestureEventTypes(frames.flat()).filter((t) => t !== 'pan')).toEqual([])
  })

  it('cursor resumes without a jump after the pan', () => {
    const frames = run([...still('open', 6), ...still('victory', 6), ...moving('victory', 15, 0.5, -0.005), ...still('open', 10, 0.425)])
    const cs = cursors(frames.flat())
    const steps = cs.slice(1).map((c, i) => Math.abs(c.x - cs[i]!.x))
    expect(Math.max(...steps)).toBeLessThan(0.03)
  })
})

describe('processFrame: near-miss two fingers', () => {
  it('asks to straighten two fingers when victory is seen without confidence', () => {
    const frames = run([...still('open', 6), ...still('victory', 30, 0.5, 0.6)])
    expect(hints(frames.flat())).toContain('HALF_PAN')
    expect(pans(frames.flat())).toEqual([])
  })

  it('keeps counting through single frames of another pose', () => {
    const mixed: F[] = Array.from({ length: 30 }, (_, i) => (i % 4 === 3 ? ['idle', 0.9, 0.5] : ['victory', 0.6, 0.5]))
    expect(hints(run([...still('open', 6), ...mixed]).flat())).toContain('HALF_PAN')
  })

  it('stays quiet for a confident victory', () => {
    expect(hints(run([...still('open', 6), ...still('victory', 40)]).flat())).not.toContain('HALF_PAN')
  })
})
