import { describe, expect, it } from 'vitest'
import type { HandId } from '../contracts/input'
import {
  BOARD_HINTS,
  DUPLICATE_OFFSET,
  initialController,
  step,
  type ControllerInput,
  type ControllerState,
  type StepResult,
} from './controller'
import { createElement, type BoardState } from './model'
import { createStore, dispatch, type BoardStore } from './store'
import { toolbarLayout } from './toolbar'

const vp = { w: 1000, h: 1000 }

/** Прогоняет события через контроллер и стор, как это делает api. */
class Harness {
  ctrl: ControllerState = initialController()
  store: BoardStore
  last: StepResult = { ctrl: this.ctrl, actions: [], effects: [] }
  private seq = 0

  constructor(state?: BoardState) {
    this.store = createStore(state)
  }

  get state(): BoardState {
    return this.store.state
  }

  send(input: ControllerInput): StepResult {
    const ctx = { state: this.store.state, viewport: vp, newId: () => `n${++this.seq}` }
    this.last = step(this.ctrl, input, ctx)
    this.ctrl = this.last.ctrl
    this.store = this.last.actions.reduce(dispatch, this.store)
    return this.last
  }

  cursor(x: number, y: number, hand: HandId = 'right', closure = 0) {
    return this.send({ type: 'cursor', e: { hand, x, y, closure, holding: closure > 0.5 } })
  }
  grab(x: number, y: number, hand: HandId = 'right') {
    return this.send({ type: 'grab', e: { hand, x, y } })
  }
  release(x: number, y: number, hand: HandId = 'right', type: 'release' | 'throw' = 'release', vx = 0, vy = 0) {
    return this.send({ type, e: { hand, x, y, vx, vy } })
  }
  point(x: number, y: number) {
    return this.send({ type: 'point', e: { hand: 'right', x, y } })
  }
  el(id: string) {
    return this.state.elements.find((e) => e.id === id)
  }
}

/** Камера (0,0), zoom 1, экран 1000×1000: мировая точка (0,0) в центре экрана. */
const board = (): Harness => {
  let s = createStore()
  s = dispatch(s, { type: 'add', element: createElement({ id: 'a', kind: 'square', x: 0, y: 0, w: 100 }) })
  s = dispatch(s, { type: 'add', element: createElement({ id: 'b', kind: 'circle', x: 300, y: 0, w: 100 }) })
  return new Harness(s.state)
}

describe('controller: grab, move, release', () => {
  it('grab on an element holds it with the grab offset and lifts it', () => {
    const h = board()
    const r = h.grab(0.52, 0.5)
    expect(h.state.held).toEqual({ hand: 'right', id: 'a', dx: -20, dy: 0 })
    expect(r.effects).toEqual([{ type: 'lift', id: 'a', hand: 'right' }])
    expect(h.ctrl.hands.right?.mode).toBe('hold')
  })

  it('held element follows the cursor', () => {
    const h = board()
    h.grab(0.5, 0.5)
    h.cursor(0.6, 0.7, 'right', 1)
    expect(h.el('a')).toMatchObject({ x: 100, y: 200 })
  })

  it('grab raises the element to the top', () => {
    const h = board()
    h.grab(0.5, 0.5)
    expect(h.el('a')?.z).toBeGreaterThan(h.el('b')?.z ?? Infinity)
  })

  it('release drops the element with drop effect', () => {
    const h = board()
    h.grab(0.5, 0.5)
    const r = h.release(0.55, 0.5)
    expect(h.state.held).toBeUndefined()
    expect(h.el('a')?.x).toBeCloseTo(50)
    expect(r.effects).toEqual([{ type: 'drop', id: 'a', hand: 'right' }])
  })

  it('release at the screen edge keeps the element visible and hints', () => {
    const h = board()
    h.grab(0.5, 0.5)
    const r = h.release(0.999, 0.5)
    expect(h.el('a')?.x).toBeCloseTo(460)
    expect(r.effects).toContainEqual({ type: 'hint', hint: BOARD_HINTS.RELEASE_EDGE })
  })

  it('hit-test respects shape: circle corner is empty space', () => {
    const h = board()
    h.grab(0.3 + 0.046, 0.5 - 0.046)
    expect(h.ctrl.hands.right?.mode).toBe('pan')
  })

  it('handlost while holding drops the element in place', () => {
    const h = board()
    h.grab(0.5, 0.5)
    const r = h.send({ type: 'handlost', e: { hand: 'right' } })
    expect(h.state.held).toBeUndefined()
    expect(r.effects[0]).toMatchObject({ type: 'drop', id: 'a' })
    expect(h.ctrl.hands.right).toBeUndefined()
  })
})

describe('controller: throw', () => {
  it('throw removes the held element and reports velocity in pixels', () => {
    const h = board()
    h.grab(0.5, 0.5)
    const r = h.release(0.6, 0.5, 'right', 'throw', 3, -1)
    expect(h.el('a')).toBeUndefined()
    expect(r.effects[0]).toMatchObject({ type: 'throw', vx: 3000, vy: -1000 })
  })

  it('undo after throw brings the element back', () => {
    const h = board()
    h.grab(0.5, 0.5)
    h.release(0.6, 0.5, 'right', 'throw', 3, 0)
    h.store = dispatch(h.store, { type: 'undo' })
    expect(h.el('a')).toBeDefined()
  })

  it('throw on empty space only ends panning', () => {
    const h = board()
    h.grab(0.1, 0.1)
    const r = h.release(0.2, 0.1, 'right', 'throw', 5, 0)
    expect(r.actions).toEqual([])
    expect(h.ctrl.hands.right?.mode).toBe('idle')
  })
})

describe('controller: pan and zoom', () => {
  it('grab on empty space pans the camera with the hand', () => {
    const h = board()
    h.cursor(0.1, 0.1)
    h.grab(0.1, 0.1)
    h.cursor(0.2, 0.15, 'right', 1)
    expect(h.state.camera).toEqual({ x: -100, y: -50, zoom: 1 })
    h.release(0.2, 0.15)
    h.cursor(0.4, 0.4)
    expect(h.state.camera.x).toBe(-100)
  })

  it('zoom scales around the pivot', () => {
    const h = board()
    h.send({ type: 'zoom', e: { factor: 2, cx: 0.5, cy: 0.5 } })
    expect(h.state.camera).toEqual({ x: 0, y: 0, zoom: 2 })
  })

  it('hints once when zoom hits the limit', () => {
    const h = board()
    const first = h.send({ type: 'zoom', e: { factor: 10, cx: 0.5, cy: 0.5 } })
    const second = h.send({ type: 'zoom', e: { factor: 2, cx: 0.5, cy: 0.5 } })
    expect(first.effects).toEqual([{ type: 'hint', hint: BOARD_HINTS.ZOOM_MAX }])
    expect(second.effects).toEqual([])
  })

  it('two-hand zoom suspends one-hand pan', () => {
    const h = board()
    h.cursor(0.1, 0.1, 'left')
    h.cursor(0.9, 0.9, 'right')
    h.grab(0.1, 0.1, 'left')
    h.grab(0.9, 0.9, 'right')
    expect(h.ctrl.hands.right?.mode).toBe('idle')
    h.send({ type: 'zoom', e: { factor: 1.5, cx: 0.5, cy: 0.5 } })
    const cam = h.state.camera
    h.cursor(0.05, 0.05, 'left', 1)
    expect(h.state.camera).toBe(cam)
  })
})

describe('controller: hover, point and toolbar', () => {
  it('cursor over an element marks it as hovered', () => {
    const h = board()
    h.cursor(0.8, 0.5)
    expect(h.ctrl.hands.right?.hoverId).toBe('b')
    h.cursor(0.1, 0.1)
    expect(h.ctrl.hands.right?.hoverId).toBeUndefined()
  })

  it('point selects an element and point on empty space clears selection', () => {
    const h = board()
    h.point(0.5, 0.5)
    expect(h.state.selectedId).toBe('a')
    h.point(0.1, 0.9)
    expect(h.state.selectedId).toBeUndefined()
  })

  const pointAt = (h: Harness, action: string) => {
    const el = h.el('a')
    if (!el) throw new Error('no element')
    const btn = toolbarLayout(el, h.state.camera, vp).buttons.find((b) => b.action === action)
    if (!btn) throw new Error('no button')
    return h.point((btn.left + btn.w / 2) / vp.w, (btn.top + btn.h / 2) / vp.h)
  }

  it('point on "duplicate" copies the selected element', () => {
    const h = board()
    h.point(0.5, 0.5)
    const r = pointAt(h, 'duplicate')
    expect(h.el('n1')).toMatchObject({ x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET, kind: 'square' })
    expect(h.state.selectedId).toBe('n1')
    expect(r.effects).toEqual([{ type: 'appear', id: 'n1' }])
  })

  it('point on "color" switches to the next color', () => {
    const h = board()
    const before = h.el('a')?.color
    h.point(0.5, 0.5)
    pointAt(h, 'color')
    expect(h.el('a')?.color).not.toBe(before)
  })

  it('point on "delete" removes with vanish effect', () => {
    const h = board()
    h.point(0.5, 0.5)
    const r = pointAt(h, 'delete')
    expect(h.el('a')).toBeUndefined()
    expect(r.effects[0]).toMatchObject({ type: 'vanish' })
  })

  it('grab on the toolbar does not pan and hints to point', () => {
    const h = board()
    h.point(0.5, 0.5)
    const el = h.el('a')
    const btn = el && toolbarLayout(el, h.state.camera, vp).buttons[0]
    const r = h.grab(((btn?.left ?? 0) + 10) / vp.w, ((btn?.top ?? 0) + 10) / vp.h)
    expect(h.ctrl.hands.right?.mode).toBe('idle')
    expect(r.effects).toEqual([{ type: 'hint', hint: BOARD_HINTS.TOOLBAR_POINT }])
  })

  it('grabbing another element clears the selection', () => {
    const h = board()
    h.point(0.5, 0.5)
    h.grab(0.8, 0.5)
    expect(h.state.selectedId).toBeUndefined()
    expect(h.state.held?.id).toBe('b')
  })
})

describe('controller: external hooks', () => {
  it('consume ends holding without drop effect', () => {
    const h = board()
    h.grab(0.5, 0.5)
    const r = h.send({ type: 'consume', hand: 'right' })
    expect(h.state.held).toBeUndefined()
    expect(r.effects).toEqual([])
  })

  it('adopt puts an existing element into the hand', () => {
    const h = board()
    h.cursor(0.8, 0.5)
    const r = h.send({ type: 'adopt', hand: 'right', id: 'b' })
    expect(h.state.held).toMatchObject({ hand: 'right', id: 'b' })
    expect(r.effects).toEqual([{ type: 'lift', id: 'b', hand: 'right' }])
    h.cursor(0.9, 0.5, 'right', 1)
    expect(h.el('b')?.x).toBeCloseTo(400)
  })

  it('second element cannot be grabbed while one is held', () => {
    const h = board()
    h.grab(0.5, 0.5, 'right')
    h.grab(0.8, 0.5, 'left')
    expect(h.state.held?.id).toBe('a')
    expect(h.ctrl.hands.left?.mode).toBe('idle')
  })
})
