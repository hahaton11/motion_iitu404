import { describe, expect, it } from 'vitest'
import type { HintEvt } from '../contracts/input'
import { HINT_GAP_MS } from './constants'
import { DEFAULT_THRESHOLDS } from './hand-state'
import { HINT_TEXTS, initialHints, stepHints, type HintHandInput, type HintInput } from './hints'

const FRAME_MS = 1000 / 30

const hand = (over: Partial<HintHandInput> = {}): HintHandInput => ({
  hand: 'right',
  phase: 'open',
  closure: 0.1,
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
    expect(hs[0]!.message).toBe('Сожми кулак полностью, чтобы взять')
    expect(hs[0]!.hand).toBe('right')
  })

  it('HALF_PINCH when a pinch is seen without confidence', () => {
    const hs = runFor({ hands: [hand({ nearPinch: true })] }, 900)
    expect(codes(hs)).toEqual(['HALF_PINCH'])
    expect(hs[0]!.message).toBe('Сомкни кончики большого и указательного, остальные пальцы согни')
  })

  it('no HALF_GRAB for a pinch: its half-bent fingers are not a half fist', () => {
    expect(runFor({ hands: [hand({ closure: 0.6, pinching: true })] }, 2000)).toEqual([])
  })

  it('HALF_RELEASE in the band while holding', () => {
    expect(codes(runFor({ hands: [hand({ closure: 0.6, phase: 'holding' })] }, 700))).toEqual(['HALF_RELEASE'])
  })

  /*
   * На экране один тост, поэтому из нескольких сработавших условий уходит одно. Пока уходили
   * все, показывалось последнее по списку: рука у края кадра отвечала «отойди на шаг назад».
   */
  it('sends one hint at a time and picks the more fundamental one', () => {
    const atEdge = hand({ center: { x: 0.02, y: 0.5 }, palmSize: 0.5, closure: 0.6 })
    expect(codes(runFor({ hands: [atEdge] }, 700))).toEqual(['HAND_NEAR_EDGE'])
  })

  /*
   * Расстояние считается по размеру ладони, а у края кадра часть точек обрезана и размер завышен.
   * Советовать там отойти — это отвечать не на ту проблему.
   */
  it('says nothing about distance while the hand is at the edge', () => {
    const far = hand({ center: { x: 0.02, y: 0.5 }, palmSize: 0.01 })
    expect(codes(runFor({ hands: [far] }, 4000))).not.toContain('TOO_FAR')
  })

  it('still reports distance once the hand is back in the middle', () => {
    expect(codes(runFor({ hands: [hand({ palmSize: 0.5 })] }, 700))).toEqual(['TOO_CLOSE'])
  })

  /*
   * Условие, проигравшее приоритет, не должно терять свой отсчёт: иначе оно созревает заново
   * каждый кадр и не срабатывает никогда, даже когда более важное уже отговорило.
   */
  it('keeps the loser ripening while a more important hint is shown', () => {
    const both = hand({ center: { x: 0.02, y: 0.5 }, closure: 0.6 })
    const hs = runFor({ hands: [both] }, 5000)
    expect(codes(hs)[0]).toBe('HAND_NEAR_EDGE')
    expect(codes(hs)).toContain('HALF_GRAB')
  })

  /*
   * Условия созревают за разное время, и вторая подсказка успевала подменить первую через долю
   * секунды. Между любыми двумя должна быть пауза, иначе читать нечего.
   */
  it('leaves a readable gap between two different hints', () => {
    const both = hand({ center: { x: 0.02, y: 0.5 }, closure: 0.6 })
    const ts = runFor({ hands: [both] }, 5000).map((h) => h.t)
    ts.slice(1).forEach((t, i) => expect(t - ts[i]!).toBeGreaterThanOrEqual(HINT_GAP_MS))
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
