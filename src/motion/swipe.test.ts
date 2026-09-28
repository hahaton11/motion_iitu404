import { describe, expect, it } from 'vitest'
import { directionOf, initialSwipe, stepSwipe, type SwipeOutcome, type SwipeState } from './swipe'

const DT = 33

/** Путь руки: точки экрана по кадрам. holding по кадрам или одно значение. */
function run(path: readonly { x: number; y: number }[], holding: boolean | readonly boolean[] = false, from: SwipeState = initialSwipe(), t0 = 0) {
  let s = from
  const outcomes: SwipeOutcome[] = []
  path.forEach((p, i) => {
    const h = typeof holding === 'boolean' ? holding : (holding[i] ?? false)
    const r = stepSwipe(s, { t: t0 + i * DT, p, holding: h })
    s = r.state
    if (r.outcome) outcomes.push(r.outcome)
  })
  return { s, outcomes, tEnd: t0 + (path.length - 1) * DT }
}

const still = (n: number, x = 0.5, y = 0.5) => Array.from({ length: n }, () => ({ x, y }))
/** Быстрое движение за n кадров на dx, dy, затем остановка. */
const flick = (dx: number, dy: number, n = 5, x0 = 0.5, y0 = 0.5) => [
  ...Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + (dx * i) / n, y: y0 + (dy * i) / n })),
  ...still(4, x0 + dx, y0 + dy),
]

describe('directionOf', () => {
  it('picks the dominant axis', () => {
    expect(directionOf(0.2, 0.02, 1.6)).toBe('right')
    expect(directionOf(-0.2, 0.05, 1.6)).toBe('left')
    expect(directionOf(0.01, 0.3, 1.6)).toBe('down')
    expect(directionOf(0, -0.3, 1.6)).toBe('up')
    expect(directionOf(0.2, 0.2, 1.6)).toBeUndefined()
  })
})

describe('stepSwipe', () => {
  it('detects a fast horizontal flick once it ends', () => {
    expect(run([...still(3), ...flick(0.25, 0)]).outcomes).toEqual([{ kind: 'swipe', dir: 'right', holding: false }])
  })

  it('detects vertical flicks', () => {
    expect(run([...still(3), ...flick(0, -0.25)]).outcomes).toEqual([{ kind: 'swipe', dir: 'up', holding: false }])
  })

  it('ignores slow drift of the same length', () => {
    const slow = Array.from({ length: 40 }, (_, i) => ({ x: 0.5 + i * 0.006, y: 0.5 }))
    expect(run(slow).outcomes).toEqual([])
  })

  it('ignores the return movement right after a swipe', () => {
    const r = run([...still(3), ...flick(0.25, 0), ...flick(-0.25, 0, 5, 0.75)])
    expect(r.outcomes).toEqual([{ kind: 'swipe', dir: 'right', holding: false }])
  })

  it('accepts the same direction again after the cooldown', () => {
    const r = run([...still(3, 0.3), ...flick(0.2, 0, 5, 0.3), ...still(10, 0.5), ...flick(0.2, 0, 5, 0.5)])
    expect(r.outcomes.map((o) => o.kind === 'swipe' && o.dir)).toEqual(['right', 'right'])
  })

  it('reports a short flick for the hint', () => {
    expect(run([...still(3), ...flick(0.09, 0, 2)]).outcomes).toEqual([{ kind: 'short' }])
  })

  it('reports a diagonal flick for the hint', () => {
    expect(run([...still(3), ...flick(0.2, 0.2)]).outcomes).toEqual([{ kind: 'diagonal' }])
  })

  it('marks swipes made while holding', () => {
    expect(run([...still(3), ...flick(0.25, 0)], true).outcomes).toEqual([{ kind: 'swipe', dir: 'right', holding: true }])
  })

  it('is not a swipe when the grab changed during the movement', () => {
    const path = [...still(3), ...flick(0.25, 0)]
    const holding = path.map((_, i) => i < 6)
    expect(run(path, holding).outcomes).toEqual([])
  })
})
