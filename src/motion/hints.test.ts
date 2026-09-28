import { describe, expect, it } from 'vitest'
import type { HintEvt } from '../contracts/input'
import { DEFAULT_THRESHOLDS } from './hand-state'
import { HINT_TEXTS, initialHints, stepHints, type HintHandInput, type HintInput } from './hints'

const FRAME_MS = 1000 / 30

const hand = (over: Partial<HintHandInput> = {}): HintHandInput => ({
  hand: 'right',
  phase: 'open',
  closure: 0.1,
  engaged: true,
  speed: 0,
  center: { x: 0.5, y: 0.5 },
  palmSize: 0.15,
  score: 0.95,
  ...over,
})

type FrameSpec = Partial<Omit<HintInput, 't' | 'thresholds'>>

/** Прогоняет одинаковые кадры durationMs и возвращает все подсказки с моментом отправки. */
const runFor = (spec: FrameSpec, durationMs: number, t0 = 0) => {
  let state = initialHints()
  const out: Array<HintEvt & { t: number }> = []
  for (let t = t0; t <= t0 + durationMs; t += FRAME_MS) {
    const r = stepHints(state, { t, hands: spec.hands ?? [hand()], lostFast: spec.lostFast ?? [], thresholds: DEFAULT_THRESHOLDS })
    state = r.state
    out.push(...r.hints.map((h) => ({ ...h, t })))
  }
  return out
}

const codes = (hs: readonly HintEvt[]): string[] => hs.map((h) => h.code)

describe('stepHints', () => {
  it('is silent for a well placed open hand', () => {
    expect(runFor({}, 5000)).toEqual([])
  })

  it('HALF_GRAB after 500 ms in the band from open', () => {
    const hs = runFor({ hands: [hand({ closure: 0.6 })] }, 700)
    expect(codes(hs)).toEqual(['HALF_GRAB'])
    expect(hs[0]!.t).toBeGreaterThanOrEqual(500)
    expect(hs[0]!.message).toBe('Сомкни большой и указательный до касания, чтобы взять')
    expect(hs[0]!.hand).toBe('right')
  })

  it('HALF_RELEASE in the band while holding', () => {
    expect(codes(runFor({ hands: [hand({ closure: 0.6, phase: 'holding' })] }, 700))).toEqual(['HALF_RELEASE'])
  })

  it('does not fire the half hints for short passes through the band', () => {
    expect(runFor({ hands: [hand({ closure: 0.6 })] }, 400)).toEqual([])
  })

  it('HAND_NEAR_EDGE near the frame border', () => {
    expect(codes(runFor({ hands: [hand({ center: { x: 0.97, y: 0.5 } })] }, 500))).toEqual(['HAND_NEAR_EDGE'])
  })

  it('TOO_FAR and TOO_CLOSE by palm size', () => {
    expect(codes(runFor({ hands: [hand({ palmSize: 0.03 })] }, 500))).toEqual(['TOO_FAR'])
    expect(codes(runFor({ hands: [hand({ palmSize: 0.5 })] }, 500))).toEqual(['TOO_CLOSE'])
  })

  it('POOR_TRACKING after a second of low confidence', () => {
    expect(runFor({ hands: [hand({ score: 0.4 })] }, 900)).toEqual([])
    expect(codes(runFor({ hands: [hand({ score: 0.4 })] }, 1100))).toEqual(['POOR_TRACKING'])
  })

  it('MOVING_TOO_FAST right away when a hand is lost at speed', () => {
    const hs = runFor({ hands: [], lostFast: ['left'] }, 0)
    expect(codes(hs)).toEqual(['MOVING_TOO_FAST'])
    expect(hs[0]!.severity).toBe('warn')
  })

  it('NO_HAND after 3 seconds without hands', () => {
    const hs = runFor({ hands: [] }, 3100)
    expect(codes(hs)).toEqual(['NO_HAND'])
    expect(hs[0]!.t).toBeGreaterThanOrEqual(3000)
    expect(hs[0]!.hand).toBeUndefined()
  })

  it('NO_HAND counts from the moment the hand disappeared', () => {
    let state = initialHints()
    state = stepHints(state, { t: 0, hands: [hand()], lostFast: [], thresholds: DEFAULT_THRESHOLDS }).state
    const early = stepHints(state, { t: 2900, hands: [], lostFast: [], thresholds: DEFAULT_THRESHOLDS })
    const late = stepHints(early.state, { t: 3000, hands: [], lostFast: [], thresholds: DEFAULT_THRESHOLDS })
    expect(early.hints).toEqual([])
    expect(codes(late.hints)).toEqual(['NO_HAND'])
  })

  it('sends one code at most once per 3 seconds', () => {
    const hs = runFor({ hands: [hand({ palmSize: 0.03 })] }, 7000)
    expect(codes(hs)).toEqual(['TOO_FAR', 'TOO_FAR', 'TOO_FAR'])
    expect(hs[1]!.t - hs[0]!.t).toBeGreaterThanOrEqual(3000)
  })

  it('applies the cooldown per code across hands', () => {
    const hs = runFor({ hands: [hand({ hand: 'left', palmSize: 0.03 }), hand({ palmSize: 0.03 })] }, 500)
    expect(codes(hs)).toEqual(['TOO_FAR'])
  })

  it('uses calibrated thresholds for the band', () => {
    let state = initialHints()
    const out: HintEvt[] = []
    for (let t = 0; t <= 700; t += FRAME_MS) {
      const r = stepHints(state, { t, hands: [hand({ closure: 0.6 })], lostFast: [], thresholds: { hold: 0.55, open: 0.3 } })
      state = r.state
      out.push(...r.hints)
    }
    expect(out).toEqual([])
  })

  it('has an action text for every code', () => {
    Object.values(HINT_TEXTS).forEach((h) => expect(h.message.length).toBeGreaterThan(10))
  })
})

describe('trackpad hints', () => {
  it('HAND_TOO_HIGH when the hand stays in the top of the frame', () => {
    expect(codes(runFor({ hands: [hand({ center: { x: 0.5, y: 0.15 } })] }, 1700))).toEqual(['HAND_TOO_HIGH'])
  })

  it('NOT_POINTING when the hand moves without the clutch', () => {
    expect(codes(runFor({ hands: [hand({ engaged: false, speed: 0.8 })] }, 1000))).toEqual(['NOT_POINTING'])
  })

  it('stays quiet while the hand moves with the clutch', () => {
    expect(codes(runFor({ hands: [hand({ engaged: true, speed: 0.8 })] }, 1000))).toEqual([])
  })
})
