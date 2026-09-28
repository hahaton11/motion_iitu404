import { describe, expect, it } from 'vitest'
import { centerIn, rect, rectHeight, rectWidth, touchesEdge } from './zones'

const zone = rect(0, 0, 100, 100)
const el = (x: number, y: number) => ({ x, y, w: 40, h: 40 })

describe('zones', () => {
  it('center inside counts, border inclusive', () => {
    expect(centerIn(zone, el(50, 50))).toBe(true)
    expect(centerIn(zone, el(100, 100))).toBe(true)
    expect(centerIn(zone, el(101, 50))).toBe(false)
  })

  it('touchesEdge: overlapping with the center outside', () => {
    expect(touchesEdge(zone, el(110, 50))).toBe(true)
    expect(touchesEdge(zone, el(50, 50))).toBe(false)
    expect(touchesEdge(zone, el(200, 50))).toBe(false)
  })

  it('size helpers', () => {
    expect(rectWidth(rect(-10, 0, 30, 5))).toBe(40)
    expect(rectHeight(rect(-10, 0, 30, 5))).toBe(5)
  })
})
