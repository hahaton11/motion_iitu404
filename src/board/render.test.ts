import { describe, expect, it } from 'vitest'
import { GRID_MAX_PX, GRID_MIN_PX, GRID_STEP, gridStep } from './render'

describe('gridStep', () => {
  it('equals the base step at zoom 1', () => {
    expect(gridStep(1)).toBe(GRID_STEP)
  })

  it.each([0.25, 0.4, 0.7, 1.3, 2, 3.7, 4])('stays in the visible range at zoom %s', (zoom) => {
    const step = gridStep(zoom)
    expect(step).toBeGreaterThanOrEqual(GRID_MIN_PX)
    expect(step).toBeLessThan(GRID_MAX_PX)
  })

  it('is a power-of-two multiple of the zoomed step, so dots stay on world positions', () => {
    const ratio = gridStep(0.3) / (GRID_STEP * 0.3)
    expect(Math.log2(ratio) % 1).toBe(0)
  })
})
