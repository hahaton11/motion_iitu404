import { describe, expect, it } from 'vitest'
import type { HintEvt } from '../contracts/input'
import { hintInfo, iconFor } from './advice'
import {
  dismissHint,
  HINT_SHOW_MS,
  initialHintLayer,
  MIN_SHOW_MS,
  offerHint,
  REPEAT_MS,
  resetStats,
  tickHints,
  topHintCode,
  totalHints,
  type HintLayerState,
} from './hint-layer'

const info = (code: string): HintEvt => ({ code, message: `do ${code}`, severity: 'info' })
const warn = (code: string): HintEvt => ({ code, message: `do ${code}`, severity: 'warn' })

describe('hint layer', () => {
  it('shows the first hint and counts it', () => {
    const r = offerHint(initialHintLayer(), info('A'), 0)
    expect(r.show).toEqual(info('A'))
    expect(r.state.counts).toEqual({ A: 1 })
  })

  it('only one at a time: info does not interrupt warn', () => {
    const s = offerHint(initialHintLayer(), warn('W'), 0).state
    const r = offerHint(s, info('I'), 2000)
    expect(r.show).toBeUndefined()
    expect(r.state.current?.hint.code).toBe('W')
  })

  it('warn replaces info immediately', () => {
    const s = offerHint(initialHintLayer(), info('I'), 0).state
    expect(offerHint(s, warn('W'), 100).show?.code).toBe('W')
  })

  it('same severity replaces only after the minimum show time', () => {
    const s = offerHint(initialHintLayer(), info('A'), 0).state
    expect(offerHint(s, info('B'), MIN_SHOW_MS - 1).show).toBeUndefined()
    expect(offerHint(s, info('B'), MIN_SHOW_MS).show?.code).toBe('B')
  })

  it('same code while visible just extends it without counting again', () => {
    const s = offerHint(initialHintLayer(), info('A'), 0).state
    const r = offerHint(s, info('A'), 2000)
    expect(r.show).toBeUndefined()
    expect(r.state.counts.A).toBe(1)
    expect(tickHints(r.state, HINT_SHOW_MS + 100).hide).toBe(false)
  })

  it('hides after the show time', () => {
    const s = offerHint(initialHintLayer(), info('A'), 0).state
    expect(tickHints(s, HINT_SHOW_MS - 1).hide).toBe(false)
    const t = tickHints(s, HINT_SHOW_MS)
    expect(t.hide).toBe(true)
    expect(t.state.current).toBeUndefined()
  })

  it('does not spam: the same code waits REPEAT_MS after showing', () => {
    let s: HintLayerState = offerHint(initialHintLayer(), info('A'), 0).state
    s = tickHints(s, HINT_SHOW_MS).state
    expect(offerHint(s, info('A'), REPEAT_MS - 1).show).toBeUndefined()
    expect(offerHint(s, info('A'), REPEAT_MS).show).toBeDefined()
  })

  it('dismiss after the right action frees the slot', () => {
    const s = dismissHint(offerHint(initialHintLayer(), warn('W'), 0).state)
    expect(s.current).toBeUndefined()
    expect(offerHint(s, info('I'), 10).show?.code).toBe('I')
    expect(dismissHint(s)).toBe(s)
  })

  it('stats: total, top code and reset', () => {
    let s = initialHintLayer()
    s = offerHint(s, info('A'), 0).state
    s = offerHint(s, info('B'), 5000).state
    s = offerHint(s, info('B'), 10000).state
    expect(totalHints(s.counts)).toBe(3)
    expect(topHintCode(s.counts)).toBe('B')
    expect(topHintCode({})).toBeUndefined()
    expect(resetStats(s).counts).toEqual({})
  })
})

describe('advice', () => {
  it('known codes have a label, advice and icon', () => {
    expect(hintInfo('HALF_GRAB').icon).toBe('fist')
    expect(hintInfo('CARRY_PUT_HOW').advice.length).toBeGreaterThan(10)
  })

  it('unknown codes fall back to the message and a prefix icon', () => {
    expect(hintInfo('TUT_THROW_FASTER', 'Махни резче')).toMatchObject({ label: 'Махни резче', icon: 'throw' })
    expect(iconFor('VOICE_SOMETHING')).toBe('voice')
    expect(iconFor('XYZ')).toBe('hand')
  })
})
