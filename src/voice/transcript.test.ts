import { describe, expect, it } from 'vitest'
import { collect, SILENCE_MS, START_TIMEOUT_MS, stickyText, stopAt } from './transcript'

describe('transcript', () => {
  it('splits final and interim parts', () => {
    const t = collect([
      { text: 'купить ', isFinal: true },
      { text: ' молоко', isFinal: true },
      { text: 'и хлеб', isFinal: false },
    ])
    expect(t).toEqual({ final: 'купить молоко', interim: 'и хлеб' })
  })

  it('builds sticky text with a capital letter', () => {
    expect(stickyText({ final: 'идея   номер один', interim: '' })).toBe('Идея номер один')
    expect(stickyText({ final: '', interim: 'ещё думаю' })).toBe('Ещё думаю')
    expect(stickyText({ final: ' ', interim: '' })).toBe('')
  })

  it('limits the sticky text length', () => {
    expect(stickyText({ final: 'а'.repeat(800), interim: '' })).toHaveLength(500)
  })

  it('stops after silence or after the start timeout', () => {
    expect(stopAt(1000, undefined)).toBe(1000 + START_TIMEOUT_MS)
    expect(stopAt(1000, 3000)).toBe(3000 + SILENCE_MS)
  })
})
