import { describe, expect, it } from 'vitest'
import type { HandId } from '../contracts/input'
import { gestureEventTypes } from './fixtures'
import { initialPipeline, processFrame, type OutEvent, type PipelineState } from './pipeline'
import { POSES, syntheticHand, type FingerCurls } from './testing/synthetic-hand'
import type { HandDetection, Thresholds } from './types'

const FRAME_MS = 1000 / 30

interface HandSpec {
  readonly pose: FingerCurls
  readonly hand?: HandId
  readonly x?: number
  readonly y?: number
  readonly score?: number
}

const det = (s: HandSpec): HandDetection =>
  syntheticHand(s.pose, { hand: s.hand ?? 'right', wrist: { x: s.x ?? 0.5, y: s.y ?? 0.75 }, score: s.score })

/** Прогоняет кадры, каждый кадр — список рук. */
const run = (frames: readonly (readonly HandSpec[])[], thresholds?: Thresholds) => {
  let state: PipelineState = initialPipeline(thresholds)
  const events: OutEvent[] = []
  frames.forEach((hands, i) => {
    const r = processFrame(state, { t: i * FRAME_MS, hands: hands.map(det) })
    state = r.state
    events.push(...r.events)
  })
  return { state, events }
}

const times = <T,>(n: number, v: T): T[] => Array<T>(n).fill(v)
const one = (s: HandSpec): HandSpec[] => [s]

describe('processFrame single hand', () => {
  it('open → pinch → open produces grab then release', () => {
    const r = run([...times(5, one({ pose: POSES.open })), ...times(5, one({ pose: POSES.grab })), ...times(5, one({ pose: POSES.open }))])
    expect(gestureEventTypes(r.events)).toEqual(['grab', 'release'])
  })

  it('sends a cursor every frame, moving it only while pointing, mirrored', () => {
    const sweep = (pose: FingerCurls) => Array.from({ length: 10 }, (_, i) => one({ pose, x: 0.5 - i * 0.01 }))
    const pointing = run(sweep(POSES.point)).events.filter((e) => e.type === 'cursor')
    expect(pointing).toHaveLength(10)
    const last = pointing[pointing.length - 1]!
    expect(last.type === 'cursor' && last.e.x).toBeGreaterThan(0.55)
    expect(last.type === 'cursor' && last.e.engaged).toBe(true)
    const idle = run(sweep(POSES.open)).events.filter((e) => e.type === 'cursor').pop()!
    expect(idle.type === 'cursor' && idle.e.x).toBeCloseTo(0.5)
    expect(idle.type === 'cursor' && idle.e.engaged).toBe(false)
  })

  it('selects with the V gesture held still', () => {
    const r = run(times(25, one({ pose: POSES.victory })))
    expect(gestureEventTypes(r.events)).toEqual(['point'])
  })

  it('reports holding in cursor after grab', () => {
    const r = run([...times(3, one({ pose: POSES.open })), ...times(4, one({ pose: POSES.grab }))])
    const last = r.events.filter((e) => e.type === 'cursor').pop()!
    expect(last.type === 'cursor' && last.e.holding).toBe(true)
  })

  it('releases and reports handlost when the hand disappears while holding', () => {
    const r = run([...times(4, one({ pose: POSES.grab })), ...times(12, [])])
    expect(gestureEventTypes(r.events)).toEqual(['grab', 'release', 'handlost'])
  })

  it('throws when the hand opens during a fast swipe', () => {
    const hold = times(4, one({ pose: POSES.grab, x: 0.7 }))
    const swipe = [0, 1, 2, 3, 4, 5].map((i) => one({ pose: i < 2 ? POSES.grab : POSES.open, x: 0.7 - i * 0.07 }))
    expect(gestureEventTypes(run([...hold, ...swipe]).events)).toEqual(['grab', 'throw'])
  })

  it('uses provided thresholds', () => {
    const half = POSES.halfPinch
    const frames = [...times(4, one({ pose: POSES.open })), ...times(4, one({ pose: half }))]
    expect(gestureEventTypes(run(frames).events)).toEqual([])
    expect(gestureEventTypes(run(frames, { hold: 0.55, open: 0.3 }).events)).toEqual(['grab'])
  })
})

describe('processFrame two hands', () => {
  const both = (pose: FingerCurls, spread: number, leftPose: FingerCurls = pose): HandSpec[] => [
    { pose: leftPose, hand: 'left', x: 0.5 + spread },
    { pose, hand: 'right', x: 0.5 - spread },
  ]

  it('zooms without extra grab or release', () => {
    const grab = times(4, both(POSES.grab, 0.1))
    const apart = [0.11, 0.13, 0.15, 0.17, 0.19].map((s) => both(POSES.grab, s))
    const flicker = times(4, both(POSES.grab, 0.19, POSES.open))
    const regrab = times(4, both(POSES.grab, 0.19))
    const r = run([...grab, ...apart, ...flicker, ...regrab])
    const types = gestureEventTypes(r.events)
    expect(types.filter((t) => t === 'grab')).toHaveLength(2)
    expect(types).not.toContain('release')
    const zooms = r.events.filter((e) => e.type === 'zoom')
    expect(zooms.length).toBeGreaterThanOrEqual(4)
    zooms.slice(0, 4).forEach((z) => expect(z.type === 'zoom' && z.e.factor).toBeGreaterThan(1))
  })

  it('releases both hands once the zoom session ends', () => {
    const r = run([...times(4, both(POSES.grab, 0.1)), ...times(4, both(POSES.grab, 0.15)), ...times(15, both(POSES.open, 0.15))])
    const types = gestureEventTypes(r.events)
    expect(types.filter((t) => t === 'release')).toHaveLength(2)
    expect(types).not.toContain('throw')
  })

  it('keeps the still holding hand held after the other one lets go', () => {
    const r = run([...times(4, both(POSES.grab, 0.1)), ...times(15, both(POSES.grab, 0.1, POSES.open))])
    const releases = r.events.filter((e) => e.type === 'release')
    expect(releases.map((e) => e.type === 'release' && e.e.hand)).toEqual(['left'])
  })
})

describe('processFrame hints', () => {
  it('asks to raise a hand after 3 seconds without hands', () => {
    const hints = run(times(100, [])).events.filter((e) => e.type === 'hint')
    expect(hints.map((h) => h.type === 'hint' && h.e.code)).toEqual(['NO_HAND'])
  })

  it('reports MOVING_TOO_FAST when a fast hand vanishes', () => {
    const fast = [0, 1, 2, 3].map((i) => one({ pose: POSES.open, x: 0.2 + i * 0.1 }))
    const hints = run([...fast, ...times(12, [])]).events.filter((e) => e.type === 'hint')
    expect(hints.map((h) => h.type === 'hint' && h.e.code)).toContain('MOVING_TOO_FAST')
  })

  it('asks to close the pinch fully for a half grab', () => {
    const hints = run(times(30, one({ pose: POSES.halfPinch }))).events.filter((e) => e.type === 'hint')
    expect(hints.map((h) => h.type === 'hint' && h.e.code)).toEqual(['HALF_GRAB'])
  })
})
