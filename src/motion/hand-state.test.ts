import { describe, expect, it } from 'vitest'
import { computeFeatures } from './features'
import {
  initialHandState,
  stepHand,
  stepHandMissing,
  type HandEvent,
  type HandFrame,
  type HandState,
} from './hand-state'
import { POSES, syntheticHand, type FingerCurls } from './testing/synthetic-hand'

const FRAME_MS = 1000 / 30

interface Sample {
  readonly closure: number
  readonly x?: number
  readonly y?: number
  readonly indexOnly?: boolean
}

const frames = (samples: readonly Sample[], t0 = 0): HandFrame[] =>
  samples.map((s, i) => ({ t: t0 + i * FRAME_MS, x: s.x ?? 0.5, y: s.y ?? 0.5, closure: s.closure, indexOnly: s.indexOnly ?? false }))

const repeat = (s: Sample, n: number): Sample[] => Array(n).fill(s)

const runFrames = (fs: readonly HandFrame[], start: HandState = initialHandState()) => {
  let state = start
  const events: HandEvent[] = []
  const phases: string[] = []
  fs.forEach((f) => {
    const r = stepHand(state, f)
    state = r.state
    events.push(...r.events)
    phases.push(state.phase)
  })
  return { state, events, phases }
}

const types = (es: readonly HandEvent[]): string[] => es.map((e) => e.type)

describe('stepHand grab and release', () => {
  it('grabs after 3 frames above the hold threshold', () => {
    const r = runFrames(frames([...repeat({ closure: 0 }, 3), ...repeat({ closure: 0.9 }, 3)]))
    expect(types(r.events)).toEqual(['grab'])
    expect(r.phases.slice(3)).toEqual(['closing', 'closing', 'holding'])
  })

  it('does not grab on 2 frames spikes', () => {
    const seq = [0, 0.9, 0.9, 0, 0.9, 0.9, 0.2].map((closure) => ({ closure }))
    expect(runFrames(frames(seq)).events).toEqual([])
  })

  it('releases after 3 frames below the open threshold', () => {
    const r = runFrames(frames([...repeat({ closure: 0.9 }, 3), ...repeat({ closure: 0.1 }, 3)]))
    expect(types(r.events)).toEqual(['grab', 'release'])
    expect(r.state.phase).toBe('open')
  })

  it('ignores the hysteresis band in both directions', () => {
    const seq = [...repeat({ closure: 0.6 }, 10), ...repeat({ closure: 0.9 }, 3), ...repeat({ closure: 0.5 }, 20)]
    const r = runFrames(frames(seq))
    expect(types(r.events)).toEqual(['grab'])
    expect(r.state.phase).toBe('holding')
  })

  it('does not grab while pointing even if closure is high', () => {
    expect(runFrames(frames(repeat({ closure: 0.8, indexOnly: true }, 10))).events).toEqual([])
  })

  it('survives 20 noisy grab and release cycles without false events', () => {
    const jitter = (base: number, i: number): number => base + 0.08 * Math.sin(i * 1.7)
    const cycle = (k: number): Sample[] => [
      ...Array.from({ length: 12 }, (_, i) => ({ closure: jitter(0.12, i + k) })),
      ...Array.from({ length: 12 }, (_, i) => ({ closure: jitter(0.88, i + k) })),
    ]
    const seq = Array.from({ length: 20 }, (_, k) => cycle(k)).flat()
    const r = runFrames(frames([...seq, ...repeat({ closure: 0.1 }, 5)]))
    expect(types(r.events)).toEqual(Array(20).fill(['grab', 'release']).flat())
  })
})

describe('stepHand throw', () => {
  it('turns a fast release into throw with the peak velocity', () => {
    const hold = repeat({ closure: 0.9, x: 0.2 }, 4)
    const fling = [0.9, 0.3, 0.2, 0.1].map((closure, i) => ({ closure, x: 0.3 + i * 0.12 }))
    const r = runFrames(frames([...hold, ...fling]))
    const last = r.events[r.events.length - 1]!
    expect(last.type).toBe('throw')
    expect(last.type === 'throw' && last.vx).toBeGreaterThan(2.2)
  })

  it('keeps a slow release as release', () => {
    const seq = [...repeat({ closure: 0.9 }, 4), ...[0.3, 0.2, 0.1].map((closure, i) => ({ closure, x: 0.5 + i * 0.005 }))]
    expect(types(runFrames(frames(seq)).events)).toEqual(['grab', 'release'])
  })
})

describe('stepHand point', () => {
  it('fires once after 600 ms of a still pointing pose', () => {
    const r = runFrames(frames(repeat({ closure: 0.7, indexOnly: true }, 40)))
    expect(types(r.events)).toEqual(['point'])
  })

  it('restarts the timer when the cursor moves more than 3%', () => {
    const seq = Array.from({ length: 30 }, (_, i) => ({ closure: 0.7, indexOnly: true, x: 0.3 + i * 0.01 }))
    expect(runFrames(frames(seq)).events).toEqual([])
  })

  it('fires again after the pose was dropped', () => {
    const pose = repeat({ closure: 0.7, indexOnly: true }, 22)
    const seq = [...pose, ...repeat({ closure: 0 }, 2), ...pose]
    expect(types(runFrames(frames(seq)).events)).toEqual(['point', 'point'])
  })
})

describe('stepHandMissing', () => {
  it('waits 300 ms before handlost', () => {
    const seen = runFrames(frames([{ closure: 0 }])).state
    expect(stepHandMissing(seen, 200).events).toEqual([])
    expect(types(stepHandMissing(seen, 300).events)).toEqual(['handlost'])
  })

  it('releases with zero velocity before handlost when holding', () => {
    const held = runFrames(frames(repeat({ closure: 0.9, x: 0.4, y: 0.6 }, 3))).state
    const r = stepHandMissing(held, 1000)
    expect(r.events).toEqual([{ type: 'release', x: 0.4, y: 0.6, vx: 0, vy: 0 }, { type: 'handlost' }])
    expect(r.state.phase).toBe('open')
  })

  it('does nothing for a hand that was never seen', () => {
    expect(stepHandMissing(initialHandState(), 5000).events).toEqual([])
  })
})

describe('synthetic poses through features', () => {
  const toFrames = (poses: readonly FingerCurls[]): HandFrame[] =>
    poses.map((p, i) => {
      const f = computeFeatures(syntheticHand(p))
      return { t: i * FRAME_MS, x: 0.5, y: 0.5, closure: f.closure, indexOnly: f.indexOnly }
    })

  it('open → fist → open gives grab and release', () => {
    const seq = [...Array(5).fill(POSES.open), ...Array(5).fill(POSES.fist), ...Array(5).fill(POSES.open)]
    expect(types(runFrames(toFrames(seq)).events)).toEqual(['grab', 'release'])
  })

  it('half-closed hand does nothing', () => {
    expect(runFrames(toFrames(Array(30).fill(POSES.half))).events).toEqual([])
  })

  it('pinch does not grab', () => {
    expect(runFrames(toFrames(Array(30).fill(POSES.pinch))).events).toEqual([])
  })

  it('pointing pose gives point and no grab', () => {
    expect(types(runFrames(toFrames(Array(30).fill(POSES.point))).events)).toEqual(['point'])
  })
})
