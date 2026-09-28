import { describe, expect, it } from 'vitest'
import { PREP_MS, ROUNDS, STEPS, advance, start, type Phase } from './protocol'

function runTo(t: number): Phase {
  let p = start(0)
  for (let now = 0; now <= t; now += 100) p = advance(p, now)
  return p
}

describe('protocol', () => {
  it('starts with preparation for the first step', () => {
    expect(start(0)).toEqual({ kind: 'prep', round: 0, step: 0, since: 0 })
  })

  it('switches to recording after the preparation', () => {
    expect(runTo(PREP_MS + 100).kind).toBe('record')
  })

  it('goes through all steps twice and finishes', () => {
    const total = ROUNDS * STEPS.reduce((s, x) => s + PREP_MS + x.recordMs, 0)
    const mid = runTo(total / 2 + 1000)
    expect(mid.kind !== 'done' && mid.kind !== 'idle' && mid.round).toBe(1)
    expect(runTo(total + 1000).kind).toBe('done')
  })
})
