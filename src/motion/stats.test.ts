import { describe, expect, it } from 'vitest'
import { initialStats, stepStats } from './stats'

describe('stepStats', () => {
  it('converges to the frame rate and latency', () => {
    let s = initialStats()
    for (let i = 0; i < 200; i++) s = stepStats(s, i * 20, 12)
    expect(s.fps).toBeCloseTo(50)
    expect(s.latencyMs).toBeCloseTo(12)
  })

  it('ignores duplicate timestamps for fps', () => {
    const s = stepStats(stepStats(initialStats(), 0, 5), 0, 5)
    expect(s.fps).toBe(0)
  })
})
