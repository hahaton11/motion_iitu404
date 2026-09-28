import { describe, expect, it } from 'vitest'
import { createElement, type BoardElement, type ElementKind } from './model'
import {
  clampToView,
  containsPoint,
  hitTest,
  normToScreen,
  screenBounds,
  screenToWorld,
  sortByZ,
  toLocal,
  worldToScreen,
} from './geometry'

const vp = { w: 1000, h: 800 }
const mk = (kind: ElementKind, extra: Partial<BoardElement> = {}): BoardElement =>
  ({ ...createElement({ id: kind, kind, x: 0, y: 0, w: 100, h: 100 }), ...extra })

describe('screen <-> world', () => {
  it('camera point is at the viewport center', () => {
    const cam = { x: 50, y: -20, zoom: 2 }
    expect(worldToScreen(cam, vp, { x: 50, y: -20 })).toEqual({ x: 500, y: 400 })
  })

  it('round-trips with zoom and offset', () => {
    const cam = { x: 13, y: 7, zoom: 0.5 }
    const w = screenToWorld(cam, vp, worldToScreen(cam, vp, { x: 120, y: -80 }))
    expect(w.x).toBeCloseTo(120)
    expect(w.y).toBeCloseTo(-80)
  })

  it('normalized input maps to viewport pixels', () => {
    expect(normToScreen(vp, 0.5, 0.25)).toEqual({ x: 500, y: 200 })
  })
})

describe('toLocal', () => {
  it('undoes element rotation around its center', () => {
    const el = mk('rect', { x: 10, y: 10, rotation: 90 })
    const p = toLocal(el, { x: 10, y: 30 })
    expect(p.x).toBeCloseTo(20)
    expect(p.y).toBeCloseTo(0)
  })
})

describe('containsPoint', () => {
  it.each(['sticky', 'rect', 'square', 'image'] as const)('%s is a box', (kind) => {
    const el = mk(kind)
    expect(containsPoint(el, { x: 49, y: 49 })).toBe(true)
    expect(containsPoint(el, { x: 51, y: 0 })).toBe(false)
  })

  it('circle excludes box corners', () => {
    const el = mk('circle')
    expect(containsPoint(el, { x: 0, y: 49 })).toBe(true)
    expect(containsPoint(el, { x: 45, y: 45 })).toBe(false)
  })

  it('circle respects ellipse proportions', () => {
    const el = mk('circle', { w: 200, h: 100 })
    expect(containsPoint(el, { x: 95, y: 0 })).toBe(true)
    expect(containsPoint(el, { x: 0, y: 60 })).toBe(false)
  })

  it('triangle has apex at top and base at bottom', () => {
    const el = mk('triangle')
    expect(containsPoint(el, { x: 0, y: -45 })).toBe(true)
    expect(containsPoint(el, { x: 40, y: -40 })).toBe(false)
    expect(containsPoint(el, { x: 45, y: 48 })).toBe(true)
    expect(containsPoint(el, { x: 0, y: 55 })).toBe(false)
  })

  it('respects rotation', () => {
    const el = mk('rect', { w: 200, h: 20, rotation: 90 })
    expect(containsPoint(el, { x: 0, y: 90 })).toBe(true)
    expect(containsPoint(el, { x: 90, y: 0 })).toBe(false)
  })

  it('rotated triangle points down at 180 degrees', () => {
    const el = mk('triangle', { rotation: 180 })
    expect(containsPoint(el, { x: 0, y: 45 })).toBe(true)
    expect(containsPoint(el, { x: 45, y: -48 })).toBe(true)
    expect(containsPoint(el, { x: 40, y: 40 })).toBe(false)
  })

  it('padding widens the hit area', () => {
    const box = mk('rect')
    const circle = mk('circle')
    const tri = mk('triangle')
    expect(containsPoint(box, { x: 58, y: 0 }, 10)).toBe(true)
    expect(containsPoint(circle, { x: 58, y: 0 }, 10)).toBe(true)
    expect(containsPoint(tri, { x: 0, y: 58 }, 10)).toBe(true)
  })
})

describe('hitTest and z order', () => {
  const a = mk('rect', { id: 'a', z: 1 })
  const b = mk('circle', { id: 'b', z: 3 })
  const c = mk('rect', { id: 'c', x: 500, z: 2 })

  it('returns the topmost element under the point', () => {
    expect(hitTest([a, b, c], { x: 0, y: 0 })?.id).toBe('b')
  })

  it('falls through a shape to the element behind it', () => {
    expect(hitTest([a, b, c], { x: 45, y: 45 })?.id).toBe('a')
  })

  it('returns undefined on empty space', () => {
    expect(hitTest([a, b, c], { x: 300, y: 300 })).toBeUndefined()
  })

  it('sortByZ returns a new ascending array', () => {
    const list = [b, c, a]
    expect(sortByZ(list).map((e) => e.id)).toEqual(['a', 'c', 'b'])
    expect(list.map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('screenBounds', () => {
  it('covers the rotated element on screen', () => {
    const el = mk('rect', { w: 200, h: 100, rotation: 90 })
    const r = screenBounds(el, { x: 0, y: 0, zoom: 2 }, vp)
    expect(r.left).toBeCloseTo(400)
    expect(r.right).toBeCloseTo(600)
    expect(r.top).toBeCloseTo(200)
    expect(r.bottom).toBeCloseTo(600)
  })
})

describe('clampToView', () => {
  it('keeps a point inside the visible world with a margin', () => {
    const cam = { x: 0, y: 0, zoom: 1 }
    expect(clampToView(cam, vp, { x: 900, y: -900 }, 50)).toEqual({ x: 450, y: -350 })
    expect(clampToView(cam, vp, { x: 10, y: 20 }, 50)).toEqual({ x: 10, y: 20 })
  })
})
