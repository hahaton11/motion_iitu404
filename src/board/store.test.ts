import { describe, expect, it } from 'vitest'
import { createElement, emptyState, type BoardElement } from './model'
import { HISTORY_LIMIT, TILT_MAX, TILT_MIN, ZOOM_MAX, ZOOM_MIN, createStore, dispatch, reduce, type BoardStore } from './store'

const el = (id: string, x = 0, y = 0): BoardElement => createElement({ id, kind: 'rect', x, y })
const withEls = (...ids: string[]): BoardStore =>
  ids.reduce((s, id, i) => dispatch(s, { type: 'add', element: el(id, i * 100) }), createStore())

describe('reduce: elements', () => {
  it('add puts the element on top of z order', () => {
    const s = withEls('a', 'b')
    expect(s.state.elements.map((e) => e.z)).toEqual([1, 2])
  })

  it('remove deletes the element and clears held and selection on it', () => {
    let s = withEls('a', 'b')
    s = dispatch(s, { type: 'select', id: 'a' })
    s = dispatch(s, { type: 'grab', hand: 'right', id: 'a', dx: 0, dy: 0 })
    s = dispatch(s, { type: 'remove', id: 'a' })
    expect(s.state.elements.map((e) => e.id)).toEqual(['b'])
    expect(s.state.held).toBeUndefined()
    expect(s.state.selectedId).toBeUndefined()
  })

  it('update patches only the target and keeps others by reference', () => {
    const s = withEls('a', 'b')
    const next = reduce(s.state, { type: 'update', id: 'a', patch: { text: 'x', color: '#000' } })
    expect(next.elements[0]).toMatchObject({ id: 'a', text: 'x', color: '#000' })
    expect(next.elements[1]).toBe(s.state.elements[1])
  })

  it('returns the same state for unknown ids', () => {
    const s = withEls('a')
    expect(reduce(s.state, { type: 'move', id: 'zzz', x: 1, y: 1 })).toBe(s.state)
    expect(reduce(s.state, { type: 'remove', id: 'zzz' })).toBe(s.state)
  })

  it('duplicate copies with offset, new id, on top, selected', () => {
    const s = dispatch(withEls('a', 'b'), { type: 'duplicate', id: 'a', newId: 'c', dx: 20, dy: 30 })
    const c = s.state.elements.find((e) => e.id === 'c')
    expect(c).toMatchObject({ x: 20, y: 30, z: 3, kind: 'rect' })
    expect(s.state.selectedId).toBe('c')
  })

  it('bringToFront raises z only when needed', () => {
    const s = withEls('a', 'b')
    const up = reduce(s.state, { type: 'bringToFront', id: 'a' })
    expect(up.elements.find((e) => e.id === 'a')?.z).toBe(3)
    expect(reduce(up, { type: 'bringToFront', id: 'a' })).toBe(up)
  })

  it('does not mutate the previous state', () => {
    const s = withEls('a')
    const frozen = JSON.stringify(s)
    dispatch(s, { type: 'move', id: 'a', x: 50, y: 50 })
    expect(JSON.stringify(s)).toBe(frozen)
  })
})

describe('reduce: holding', () => {
  it('grab raises the element and dragTo moves it by the grab offset', () => {
    let s = withEls('a', 'b')
    s = dispatch(s, { type: 'grab', hand: 'left', id: 'a', dx: 5, dy: -5 })
    s = dispatch(s, { type: 'dragTo', x: 300, y: 200 })
    const a = s.state.elements.find((e) => e.id === 'a')
    expect(a).toMatchObject({ x: 305, y: 195, z: 3 })
    expect(s.state.held).toEqual({ hand: 'left', id: 'a', dx: 5, dy: -5 })
  })

  it('dragTo without held element is a no-op', () => {
    const s = withEls('a')
    expect(reduce(s.state, { type: 'dragTo', x: 1, y: 1 })).toBe(s.state)
  })

  it('release clears held', () => {
    let s = withEls('a')
    s = dispatch(s, { type: 'grab', hand: 'right', id: 'a', dx: 0, dy: 0 })
    s = dispatch(s, { type: 'release' })
    expect(s.state.held).toBeUndefined()
  })
})

describe('reduce: camera', () => {
  it('pan moves camera opposite to the hand, scaled by zoom', () => {
    const s = reduce({ ...emptyState(), camera: { x: 0, y: 0, zoom: 2 } }, { type: 'pan', dx: 100, dy: -50 })
    expect(s.camera).toEqual({ x: -50, y: 25, zoom: 2 })
  })

  it('zoom keeps the world point under the pivot fixed', () => {
    const start = { ...emptyState(), camera: { x: 10, y: 20, zoom: 1 } }
    const s = reduce(start, { type: 'zoom', factor: 2, ox: 100, oy: 50 })
    const before = { x: 100 / 1 + 10, y: 50 / 1 + 20 }
    const after = { x: 100 / s.camera.zoom + s.camera.x, y: 50 / s.camera.zoom + s.camera.y }
    expect(s.camera.zoom).toBe(2)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('zoom is clamped to limits', () => {
    const big = reduce(emptyState(), { type: 'zoom', factor: 100, ox: 0, oy: 0 })
    const small = reduce(emptyState(), { type: 'zoom', factor: 0.001, ox: 0, oy: 0 })
    expect(big.camera.zoom).toBe(ZOOM_MAX)
    expect(small.camera.zoom).toBe(ZOOM_MIN)
  })

  /*
   * Наклон — свойство сцены, а не взгляда камеры. Челлендж ставил камеру по размеру окна
   * и ронял наклон в ноль: доска там была плоской, а объём оставался только на экранах,
   * где камеру никто не трогал.
   */
  it('setCamera without a tilt keeps the one the scene already had', () => {
    const start = emptyState()
    expect(start.camera.tilt).toBeGreaterThan(0)
    const s = reduce(start, { type: 'setCamera', camera: { x: 0, y: 0, zoom: 1.4 } })
    expect(s.camera.tilt).toBe(start.camera.tilt)
    expect(s.camera.zoom).toBe(1.4)
  })

  it('setCamera with a tilt still sets it, so the scene can be flattened on purpose', () => {
    const s = reduce(emptyState(), { type: 'setCamera', camera: { x: 0, y: 0, zoom: 1, tilt: 0 } })
    expect(s.camera.tilt).toBe(0)
  })

  /** Камера в зуме пересобирается целиком, и наклон однажды уже терялся именно так. */
  it('zoom keeps the tilt', () => {
    const start = emptyState()
    const s = reduce(start, { type: 'zoom', factor: 2, ox: 100, oy: 50 })
    expect(s.camera.tilt).toBe(start.camera.tilt)
  })

  it('tilt adds up and is clamped to the limits', () => {
    const start = emptyState()
    expect(reduce(start, { type: 'tilt', delta: 5 }).camera.tilt).toBe((start.camera.tilt ?? 0) + 5)
    expect(reduce(start, { type: 'tilt', delta: 999 }).camera.tilt).toBe(TILT_MAX)
    expect(reduce(start, { type: 'tilt', delta: -999 }).camera.tilt).toBe(TILT_MIN)
  })

  it('a tilt that changes nothing returns the same state', () => {
    const flat = { ...emptyState(), camera: { x: 0, y: 0, zoom: 1, tilt: TILT_MIN } }
    expect(reduce(flat, { type: 'tilt', delta: -3 })).toBe(flat)
  })
})

describe('history', () => {
  it('undo and redo restore elements', () => {
    let s = withEls('a')
    s = dispatch(s, { type: 'remove', id: 'a' })
    s = dispatch(s, { type: 'undo' })
    expect(s.state.elements.map((e) => e.id)).toEqual(['a'])
    s = dispatch(s, { type: 'redo' })
    expect(s.state.elements).toEqual([])
  })

  it('a whole drag is one undo step', () => {
    let s = withEls('a')
    s = dispatch(s, { type: 'grab', hand: 'right', id: 'a', dx: 0, dy: 0 })
    for (let i = 1; i <= 10; i++) s = dispatch(s, { type: 'dragTo', x: i * 10, y: 0 })
    s = dispatch(s, { type: 'release' })
    s = dispatch(s, { type: 'undo' })
    expect(s.state.elements[0]?.x).toBe(0)
  })

  it('camera, selection and drag moves are not recorded', () => {
    let s = withEls('a')
    const depth = s.past.length
    s = dispatch(s, { type: 'pan', dx: 10, dy: 10 })
    s = dispatch(s, { type: 'select', id: 'a' })
    s = dispatch(s, { type: 'zoom', factor: 2, ox: 0, oy: 0 })
    expect(s.past.length).toBe(depth)
  })

  it('undo keeps camera and is ignored while holding', () => {
    let s = dispatch(withEls('a', 'b'), { type: 'pan', dx: 40, dy: 0 })
    const cam = s.state.camera
    s = dispatch(s, { type: 'undo' })
    expect(s.state.camera).toBe(cam)
    s = dispatch(s, { type: 'grab', hand: 'right', id: 'a', dx: 0, dy: 0 })
    expect(dispatch(s, { type: 'undo' })).toBe(s)
  })

  it('undo clears selection of an element that no longer exists', () => {
    let s = withEls('a')
    s = dispatch(s, { type: 'add', element: el('b') })
    s = dispatch(s, { type: 'select', id: 'b' })
    s = dispatch(s, { type: 'undo' })
    expect(s.state.selectedId).toBeUndefined()
  })

  it(`keeps at most ${HISTORY_LIMIT} steps`, () => {
    let s = createStore()
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) s = dispatch(s, { type: 'add', element: el(`e${i}`) })
    expect(s.past.length).toBe(HISTORY_LIMIT)
  })

  it('new change clears redo stack; undo on empty history is a no-op', () => {
    let s = withEls('a')
    s = dispatch(s, { type: 'undo' })
    s = dispatch(s, { type: 'add', element: el('b') })
    expect(s.future).toEqual([])
    const empty = createStore()
    expect(dispatch(empty, { type: 'undo' })).toBe(empty)
    expect(dispatch(empty, { type: 'redo' })).toBe(empty)
  })
})
