import { describe, expect, it } from 'vitest'
import { normToScreen, screenToWorld } from './geometry'
import type { HandId } from '../contracts/input'
import {
  BOARD_HINTS,
  DUPLICATE_OFFSET,
  GRIP_HINT_COOLDOWN_MS,
  initialController,
  PINCH_GRAB_HINT_COOLDOWN_MS,
  PINCH_GRAB_HINT_MS,
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
  now = 0

  constructor(state?: BoardState) {
    this.store = createStore(state)
  }

  get state(): BoardState {
    return this.store.state
  }

  send(input: ControllerInput): StepResult {
    const ctx = { state: this.store.state, viewport: vp, newId: () => `n${++this.seq}`, now: this.now }
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
  pan(dx: number, dy: number, hand: HandId = 'right') {
    return this.send({ type: 'pan', e: { hand, dx, dy } })
  }
  panCursor(x: number, y: number, panning = true, hand: HandId = 'right') {
    return this.send({ type: 'cursor', e: { hand, x, y, closure: 0, holding: false, panning } })
  }
  pinchCursor(x: number, y: number, zooming = true, hand: HandId = 'right') {
    return this.send({ type: 'cursor', e: { hand, x, y, closure: 0, holding: false, zooming } })
  }
  zoom(factor: number, cx = 0.5, cy = 0.5) {
    return this.send({ type: 'zoom', e: { factor, cx, cy } })
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

  /*
   * Проверяется экранный инвариант, а не мировые координаты: элемент должен оказаться там,
   * куда человек показывает. Мировая точка под курсором зависит от наклона доски, и сверка
   * с числом означала бы «доска плоская», а не «элемент следует за рукой».
   */
  it('held element follows the cursor', () => {
    const h = board()
    h.grab(0.5, 0.5)
    h.cursor(0.6, 0.7, 'right', 1)
    const under = screenToWorld(h.state.camera, vp, normToScreen(vp, 0.6, 0.7))
    expect(h.el('a')!.x).toBeCloseTo(under.x)
    expect(h.el('a')!.y).toBeCloseTo(under.y)
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
    expect(h.ctrl.hands.right?.mode).toBe('grip')
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

  it('throw on empty space only ends the grip', () => {
    const h = board()
    h.grab(0.1, 0.1)
    const r = h.release(0.2, 0.1, 'right', 'throw', 5, 0)
    expect(r.actions).toEqual([])
    expect(h.ctrl.hands.right?.mode).toBe('idle')
  })
})

describe('controller: pan and zoom', () => {
  it('pan event moves the camera with the hand in screen fractions', () => {
    const h = board()
    h.panCursor(0.1, 0.1)
    const r = h.pan(0.1, 0.05)
    expect(r.actions).toEqual([{ type: 'pan', dx: 100, dy: 50 }])
    expect(h.state.camera).toMatchObject({ x: -100, y: -50, zoom: 1 })
    expect(h.ctrl.hands.right?.mode).toBe('pan')
  })

  it('panning cursor switches the hand to pan mode and drops the hover', () => {
    const h = board()
    h.cursor(0.5, 0.5)
    expect(h.ctrl.hands.right?.hoverId).toBe('a')
    h.panCursor(0.5, 0.5)
    expect(h.ctrl.hands.right?.mode).toBe('pan')
    expect(h.ctrl.hands.right?.hoverId).toBeUndefined()
  })

  it('cursor without the panning flag ends the pan, the camera stays', () => {
    const h = board()
    h.panCursor(0.1, 0.1)
    h.pan(0.1, 0)
    h.cursor(0.4, 0.4)
    expect(h.ctrl.hands.right?.mode).toBe('idle')
    expect(h.state.camera.x).toBe(-100)
    h.cursor(0.6, 0.6)
    expect(h.state.camera.x).toBe(-100)
  })

  it('pan is ignored while the hand holds an element', () => {
    const h = board()
    h.grab(0.5, 0.5)
    const r = h.pan(0.1, 0)
    expect(r.actions).toEqual([])
    expect(h.ctrl.hands.right?.mode).toBe('hold')
  })

  it('fist on empty space does not move the camera', () => {
    const h = board()
    h.cursor(0.1, 0.1)
    h.grab(0.1, 0.1)
    h.cursor(0.3, 0.3, 'right', 1)
    h.release(0.3, 0.3)
    expect(h.state.camera).toMatchObject({ x: 0, y: 0, zoom: 1 })
  })

  it('dragging a fist on empty space hints to show two fingers, not more often than the cooldown', () => {
    const h = board()
    h.grab(0.1, 0.1)
    expect(h.cursor(0.11, 0.1, 'right', 1).effects).toEqual([])
    expect(h.cursor(0.2, 0.1, 'right', 1).effects).toEqual([{ type: 'hint', hint: BOARD_HINTS.GRIP_PAN }])
    h.now = 1000
    expect(h.cursor(0.3, 0.1, 'right', 1).effects).toEqual([])
    h.release(0.3, 0.1)
    h.grab(0.1, 0.1)
    h.now = GRIP_HINT_COOLDOWN_MS + 1
    expect(h.cursor(0.3, 0.1, 'right', 1).effects).toEqual([{ type: 'hint', hint: BOARD_HINTS.GRIP_PAN }])
  })

  it('two fists for zoom do not trigger the two-finger hint', () => {
    const h = board()
    h.grab(0.1, 0.1, 'left')
    h.grab(0.9, 0.9, 'right')
    expect(h.cursor(0.3, 0.3, 'left', 1).effects).toEqual([])
    h.send({ type: 'zoom', e: { factor: 1.2, cx: 0.5, cy: 0.5 } })
    h.release(0.9, 0.9, 'right')
    expect(h.cursor(0.05, 0.05, 'left', 1).effects).toEqual([])
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

  it('two-hand zoom suspends pan', () => {
    const h = board()
    h.cursor(0.1, 0.1, 'left')
    h.cursor(0.9, 0.9, 'right')
    h.grab(0.1, 0.1, 'left')
    h.grab(0.9, 0.9, 'right')
    expect(h.ctrl.hands.right?.mode).toBe('grip')
    h.send({ type: 'zoom', e: { factor: 1.5, cx: 0.5, cy: 0.5 } })
    const cam = h.state.camera
    h.cursor(0.05, 0.05, 'left', 1)
    h.pan(0.1, 0.1, 'left')
    expect(h.state.camera).toBe(cam)
  })
})

describe('controller: one-hand pinch zoom', () => {
  it('pinch cursor switches the hand to zoom mode and drops the hover', () => {
    const h = board()
    h.cursor(0.5, 0.5)
    h.pinchCursor(0.5, 0.5)
    expect(h.ctrl.hands.right?.mode).toBe('zoom')
    expect(h.ctrl.hands.right?.hoverId).toBeUndefined()
  })

  it('pinch over an element zooms the board and does not take the element', () => {
    const h = board()
    h.cursor(0.5, 0.5)
    h.pinchCursor(0.5, 0.5)
    const r = h.zoom(1.5)
    expect(r.actions).toEqual([{ type: 'zoom', factor: 1.5, ox: 0, oy: 0 }])
    expect(h.state.camera.zoom).toBe(1.5)
    expect(h.state.held).toBeUndefined()
  })

  it('the fist over the same element takes it', () => {
    const h = board()
    h.cursor(0.5, 0.5)
    h.grab(0.5, 0.5)
    expect(h.state.held?.id).toBe('a')
  })

  it('cursor without the zooming flag ends the pinch zoom', () => {
    const h = board()
    h.pinchCursor(0.1, 0.1)
    h.zoom(1.2)
    h.cursor(0.1, 0.1)
    expect(h.ctrl.hands.right?.mode).toBe('idle')
    expect(h.ctrl.hands.right?.pinchOn).toBeUndefined()
  })

  it('a still pinch over an element hints to grab with the fist, not more often than the cooldown', () => {
    const h = board()
    h.cursor(0.5, 0.5)
    h.pinchCursor(0.5, 0.5)
    h.now = PINCH_GRAB_HINT_MS - 100
    expect(h.pinchCursor(0.5, 0.5).effects).toEqual([])
    h.now = PINCH_GRAB_HINT_MS
    expect(h.pinchCursor(0.5, 0.5).effects).toEqual([{ type: 'hint', hint: BOARD_HINTS.PINCH_GRAB }])
    h.now = PINCH_GRAB_HINT_MS * 3
    expect(h.pinchCursor(0.5, 0.5).effects).toEqual([])
    h.now = PINCH_GRAB_HINT_MS + PINCH_GRAB_HINT_COOLDOWN_MS
    expect(h.pinchCursor(0.5, 0.5).effects).toEqual([{ type: 'hint', hint: BOARD_HINTS.PINCH_GRAB }])
  })

  it('no grab hint while the pinch is zooming or over empty space', () => {
    const h = board()
    h.cursor(0.5, 0.5)
    h.pinchCursor(0.5, 0.5)
    h.now = 600
    h.zoom(1.1)
    h.now = 1200
    expect(h.pinchCursor(0.5, 0.5).effects).toEqual([])
    const empty = board()
    empty.pinchCursor(0.1, 0.1)
    empty.now = 5000
    expect(empty.pinchCursor(0.1, 0.1).effects).toEqual([])
  })

  it('pinch zoom into the limit hints which way to move the pinch', () => {
    const h = board()
    h.pinchCursor(0.5, 0.5)
    expect(h.zoom(10).effects).toEqual([{ type: 'hint', hint: BOARD_HINTS.ZOOM_MAX_PINCH }])
    expect(h.state.camera.zoom).toBe(4)
    expect(h.zoom(1e-3).effects).toEqual([{ type: 'hint', hint: BOARD_HINTS.ZOOM_MIN_PINCH }])
    expect(h.state.camera.zoom).toBe(0.25)
    expect(BOARD_HINTS.ZOOM_MAX_PINCH.code).toBe('BOARD_ZOOM_MAX')
    expect(BOARD_HINTS.ZOOM_MIN_PINCH.code).toBe('BOARD_ZOOM_MIN')
  })

  it('a pinch zoom with the other hand in view does not suspend the pan afterwards', () => {
    const h = board()
    h.cursor(0.9, 0.9, 'left')
    h.pinchCursor(0.1, 0.1)
    h.zoom(1.2)
    expect(h.ctrl.zooming).toBe(false)
    h.panCursor(0.1, 0.1)
    expect(h.pan(0.1, 0).actions).toHaveLength(1)
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
