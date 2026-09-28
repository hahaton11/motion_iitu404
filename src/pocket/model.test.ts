import { describe, expect, it } from 'vitest'
import type { BoardElement } from '../board'
import {
  addItem,
  contentOf,
  emptyPocket,
  hiddenCounts,
  makeItem,
  parseItem,
  removeItem,
  scrollBy,
  setItems,
  sortItems,
  stashElement,
  takeItem,
  visibleItems,
  type PocketItem,
} from './model'

const sticky = (id: string, type: PocketItem['type'] = 'preset', t = 0): PocketItem =>
  makeItem(id, type, { kind: 'sticky', text: id }, t)

const many = (n: number): readonly PocketItem[] => Array.from({ length: n }, (_, i) => sticky(`p${i}`))

const element: BoardElement = {
  id: 'el-1',
  kind: 'circle',
  x: 100,
  y: -40,
  w: 160,
  h: 160,
  rotation: 4,
  color: '#3fe0b0',
  z: 7,
}

describe('pocket model', () => {
  it('adds new items to the front and resets scroll', () => {
    const s = addItem(scrollBy(setItems(emptyPocket(), many(10), 3), 2, 3), sticky('new'))
    expect(s.items[0]?.id).toBe('new')
    expect(s.offset).toBe(0)
  })

  it('does not mutate the previous state', () => {
    const a = setItems(emptyPocket(), many(2))
    addItem(a, sticky('x'))
    expect(a.items).toHaveLength(2)
  })

  it('taking a preset returns a copy spec and keeps the preset', () => {
    const s = setItems(emptyPocket(), [sticky('a'), sticky('b')])
    const r = takeItem(s, 'a')
    expect(r?.spec).toEqual({ kind: 'sticky', text: 'a' })
    expect(r?.state).toBe(s)
  })

  it('taking a stash item removes it from the pocket', () => {
    const s = setItems(emptyPocket(), [sticky('a', 'stash'), sticky('b')])
    const r = takeItem(s, 'a')
    expect(r?.state.items.map((i) => i.id)).toEqual(['b'])
  })

  it('taking an unknown id returns undefined', () => {
    expect(takeItem(emptyPocket(), 'nope')).toBeUndefined()
  })

  it('stashes a board element without id, position and layer', () => {
    const item = stashElement(element, 'pk-1', 5)
    expect(item).toEqual({
      id: 'pk-1',
      type: 'stash',
      createdAt: 5,
      content: { kind: 'circle', w: 160, h: 160, color: '#3fe0b0', rotation: 4 },
    })
    expect(contentOf({ ...element, kind: 'sticky', text: 'hi' }).text).toBe('hi')
  })

  it('scroll clamps to the ends', () => {
    const s = setItems(emptyPocket(), many(10), 7)
    expect(scrollBy(s, -3, 7)).toBe(s)
    expect(scrollBy(s, 10, 7).offset).toBe(3)
  })

  it('visible slice and hidden counts follow the offset', () => {
    const s = scrollBy(setItems(emptyPocket(), many(10), 4), 2, 4)
    expect(visibleItems(s, 4).map((i) => i.id)).toEqual(['p2', 'p3', 'p4', 'p5'])
    expect(hiddenCounts(s, 4)).toEqual({ before: 2, after: 4 })
  })

  it('removing items pulls the offset back into range', () => {
    const s = scrollBy(setItems(emptyPocket(), many(8), 7), 1, 7)
    expect(removeItem(s, 'p7', 7).offset).toBe(0)
    expect(removeItem(s, 'missing', 7)).toBe(s)
  })

  it('sorts newest first', () => {
    const sorted = sortItems([sticky('old', 'preset', 1), sticky('new', 'preset', 9)])
    expect(sorted.map((i) => i.id)).toEqual(['new', 'old'])
  })
})

describe('parseItem', () => {
  it('accepts a valid item and drops unknown fields', () => {
    const raw = { id: 'a', type: 'preset', createdAt: 3, content: { kind: 'sticky', text: 'x', evil: 1 } }
    expect(parseItem(raw)).toEqual({ id: 'a', type: 'preset', createdAt: 3, content: { kind: 'sticky', text: 'x' } })
  })

  it('rejects broken records', () => {
    expect(parseItem(null)).toBeUndefined()
    expect(parseItem({ id: 'a', type: 'weird', content: { kind: 'sticky' } })).toBeUndefined()
    expect(parseItem({ id: 'a', type: 'preset', content: { kind: 'hexagon' } })).toBeUndefined()
  })

  it('rejects images without a safe source', () => {
    const img = (src: string) => ({ id: 'i', type: 'preset', content: { kind: 'image', src } })
    expect(parseItem(img('javascript:alert(1)'))).toBeUndefined()
    expect(parseItem(img('data:image/png;base64,AAAA'))?.content.src).toBe('data:image/png;base64,AAAA')
    expect(parseItem(img('./presets/idea.svg'))).toBeDefined()
  })

  it('clamps sizes into a sane range', () => {
    const raw = { id: 'a', type: 'stash', content: { kind: 'rect', w: 1e9, h: -5 } }
    expect(parseItem(raw)?.content).toEqual({ kind: 'rect', w: 2000, h: 1 })
  })
})
