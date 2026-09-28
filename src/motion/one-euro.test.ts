import { describe, expect, it } from 'vitest'
import { oneEuro2DStep, oneEuro2DValue, oneEuroStep, type OneEuroState } from './one-euro'

const FRAME_MS = 1000 / 30

/** Детерминированный шум, чтобы тест не зависел от Math.random. */
const noise = (i: number): number => Math.sin(i * 12.9898) * 43758.5453 % 1

const run = (values: readonly number[]): number[] => {
  let s: OneEuroState | undefined
  return values.map((v, i) => {
    s = oneEuroStep(s, v, i * FRAME_MS)
    return s.value
  })
}

const std = (xs: readonly number[]): number => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

describe('oneEuroStep', () => {
  it('passes the first sample through', () => {
    expect(oneEuroStep(undefined, 0.4, 0).value).toBe(0.4)
  })

  it('keeps a constant signal constant', () => {
    expect(run(Array(30).fill(0.5)).every((v) => v === 0.5)).toBe(true)
  })

  it('removes most of the jitter of a hand at rest', () => {
    const input = Array.from({ length: 120 }, (_, i) => 0.5 + 0.004 * noise(i))
    const output = run(input).slice(30)
    expect(std(output)).toBeLessThan(std(input.slice(30)) * 0.4)
    // Приёмка: видимое смещение в покое меньше 0.3% экрана.
    expect(std(output)).toBeLessThan(0.0015)
  })

  it('follows fast motion with small lag', () => {
    const input = Array.from({ length: 30 }, (_, i) => (i * FRAME_MS) / 1000)
    const output = run(input)
    expect(input[29]! - output[29]!).toBeLessThan(0.05)
  })

  it('ignores samples with non-increasing time', () => {
    const s = oneEuroStep(undefined, 0.2, 100)
    expect(oneEuroStep(s, 0.9, 100)).toBe(s)
  })
})

describe('oneEuro2DStep', () => {
  it('filters both axes independently', () => {
    const a = oneEuro2DStep(undefined, { x: 0.1, y: 0.9 }, 0)
    const b = oneEuro2DStep(a, { x: 0.1, y: 0.9 }, FRAME_MS)
    expect(oneEuro2DValue(b)).toEqual({ x: 0.1, y: 0.9 })
  })
})
