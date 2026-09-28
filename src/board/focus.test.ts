import { describe, expect, it } from 'vitest'
import { distanceToElement, focusAt } from './focus'
import type { BoardElement } from './model'

const el = (id: string, kind: BoardElement['kind'], x: number, y: number, z = 0): BoardElement => ({
  id,
  kind,
  x,
  y,
  w: 100,
  h: 100,
  rotation: 0,
  color: '#fff',
  z,
})

describe('distanceToElement', () => {
  it('is zero inside and grows outside a box', () => {
    const box = el('a', 'rect', 0, 0)
    expect(distanceToElement(box, { x: 10, y: 10 })).toBe(0)
    expect(distanceToElement(box, { x: 80, y: 0 })).toBeCloseTo(30)
    expect(distanceToElement(box, { x: 53, y: 54 })).toBeCloseTo(5)
  })

  it('handles circles and triangles', () => {
    expect(distanceToElement(el('c', 'circle', 0, 0), { x: 70, y: 0 })).toBeCloseTo(20)
    expect(distanceToElement(el('t', 'triangle', 0, 0), { x: 0, y: 70 })).toBeCloseTo(20)
  })

  it('respects rotation', () => {
    const rotated = { ...el('r', 'rect', 0, 0), w: 200, h: 20, rotation: 90 }
    expect(distanceToElement(rotated, { x: 0, y: 90 })).toBe(0)
    expect(distanceToElement(rotated, { x: 30, y: 0 })).toBeCloseTo(20)
  })
})

describe('focusAt', () => {
  const a = el('a', 'rect', 0, 0)
  const b = el('b', 'rect', 200, 0)

  it('focuses the nearest element within the radius', () => {
    expect(focusAt([a, b], { x: 70, y: 0 }, 80, 0)?.id).toBe('a')
    expect(focusAt([a, b], { x: 130, y: 0 }, 80, 0)?.id).toBe('b')
  })

  it('returns nothing outside the radius', () => {
    expect(focusAt([a], { x: 200, y: 0 }, 80, 0)).toBeUndefined()
  })

  it('keeps the current focus until the rival is clearly closer', () => {
    expect(focusAt([a, b], { x: 105, y: 0 }, 80, 24, 'a')?.id).toBe('a')
    expect(focusAt([a, b], { x: 135, y: 0 }, 80, 24, 'a')?.id).toBe('b')
  })

  it('prefers the element under the cursor over a sticky neighbour', () => {
    expect(focusAt([a, b], { x: 160, y: 0 }, 80, 24, 'a')?.id).toBe('b')
  })

  it('picks the top element when several contain the point', () => {
    const low = el('low', 'rect', 0, 0, 1)
    const top = el('top', 'rect', 20, 0, 5)
    expect(focusAt([low, top], { x: 10, y: 0 }, 80, 24)?.id).toBe('top')
  })
})
