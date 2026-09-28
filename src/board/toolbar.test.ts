import { describe, expect, it } from 'vitest'
import { createElement } from './model'
import { TOOLBAR_EDGE, TOOLBAR_OFFSET, toolbarHit, toolbarLayout } from './toolbar'

const vp = { w: 1000, h: 800 }
const cam = { x: 0, y: 0, zoom: 1 }

describe('toolbarLayout', () => {
  it('sits centered above the element', () => {
    const el = createElement({ id: 'a', kind: 'square', x: 0, y: 0, w: 100 })
    const l = toolbarLayout(el, cam, vp)
    expect(l.top + l.h).toBeCloseTo(350 - TOOLBAR_OFFSET)
    expect(l.left + l.w / 2).toBeCloseTo(500)
    expect(l.buttons.map((b) => b.action)).toEqual(['duplicate', 'color', 'delete'])
  })

  it('moves below the element near the top edge and stays inside the viewport', () => {
    const el = createElement({ id: 'a', kind: 'square', x: -490, y: -390, w: 40 })
    const l = toolbarLayout(el, cam, vp)
    expect(l.top).toBeGreaterThan(30)
    expect(l.left).toBe(TOOLBAR_EDGE)
  })
})

describe('toolbarHit', () => {
  const l = toolbarLayout(createElement({ id: 'a', kind: 'square', x: 0, y: 0, w: 100 }), cam, vp)

  it('returns the button under the point', () => {
    l.buttons.forEach((b) => {
      expect(toolbarHit(l, { x: b.left + b.w / 2, y: b.top + b.h / 2 })).toBe(b.action)
    })
  })

  it('returns undefined outside the toolbar', () => {
    expect(toolbarHit(l, { x: 500, y: 400 })).toBeUndefined()
  })
})
