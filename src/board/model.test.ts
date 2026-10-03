import { describe, expect, it } from 'vitest'
import { DEFAULT_SIZE, ELEMENT_KINDS, createElement, emptyState, nextColor, PALETTE } from './model'

describe('createElement', () => {
  it('creates every kind with default size and color', () => {
    ELEMENT_KINDS.forEach((kind) => {
      const el = createElement({ id: kind, kind, x: 10, y: 20 })
      expect(el.w).toBe(DEFAULT_SIZE[kind].w)
      expect(el.h).toBe(DEFAULT_SIZE[kind].h)
      expect(el.color).toMatch(/^#/)
      expect(el.rotation).toBe(0)
      expect(el.z).toBe(0)
    })
  })

  it('keeps explicit fields over defaults', () => {
    const el = createElement({ id: 'a', kind: 'sticky', x: 0, y: 0, w: 50, color: '#fff', text: 'идея', z: 7 })
    expect(el).toMatchObject({ w: 50, h: DEFAULT_SIZE.sticky.h, color: '#fff', text: 'идея', z: 7 })
  })

  it('square keeps equal sides when only w is given', () => {
    const el = createElement({ id: 'a', kind: 'square', x: 0, y: 0, w: 90 })
    expect(el.h).toBe(90)
  })

  it('sticky gets empty text by default', () => {
    expect(createElement({ id: 'a', kind: 'sticky', x: 0, y: 0 }).text).toBe('')
  })
})

describe('nextColor', () => {
  it('cycles through the palette of the kind', () => {
    const list = PALETTE.sticky
    const first = list[0] ?? ''
    const second = list[1] ?? ''
    const last = list[list.length - 1] ?? ''
    expect(nextColor('sticky', first)).toBe(second)
    expect(nextColor('sticky', last)).toBe(first)
  })

  it('starts from the first color for unknown values', () => {
    expect(nextColor('circle', '#123456')).toBe(PALETTE.circle[0])
  })
})

describe('emptyState', () => {
  it('has no elements and neutral camera', () => {
    expect(emptyState()).toMatchObject({ elements: [], camera: { x: 0, y: 0, zoom: 1 } })
  })
})
