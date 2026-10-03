import type { GrabEvt, HandId, HintEvt, InputEventType, InputSource } from '../contracts/input'
import { initialController, step, type BoardEffect, type ControllerInput, type ControllerState } from './controller'
import { CursorLayer } from './cursor'
import { Emitter, type Unsubscribe } from './events'
import { BoardFx } from './fx'
import { hitTest, normToScreen, screenToWorld, worldToScreen, type Point, type Viewport } from './geometry'
import { createElement, type BoardElement, type BoardState, type Camera, type ElementPatch, type ElementSpec } from './model'
import { BoardRenderer } from './render'
import { createStore, dispatch, type BoardAction, type BoardStore } from './store'
import { ToolbarView } from './toolbar-view'
import type { ToolbarAction } from './toolbar'
import { HIT_PAD_PX } from './controller'

/** Новый элемент: id и позиция необязательны. Позиция по умолчанию — центр экрана. */
export type NewElement = Omit<ElementSpec, 'id' | 'x' | 'y'> & Partial<Pick<ElementSpec, 'id' | 'x' | 'y'>>

export interface AddOptions {
  /** Сразу вложить элемент в руку в точке её прицела (карман: «достать»). */
  readonly hold?: HandId
  /** Анимация появления, по умолчанию true. */
  readonly animate?: boolean
}

export interface RemoveOptions {
  /** 'vanish' по умолчанию. Точка { x, y } в долях экрана: улететь туда (карман). */
  readonly animate?: 'vanish' | 'none' | { readonly x: number; readonly y: number }
}

/** Отпускание удерживаемого элемента. x, y, vx, vy — в долях экрана, как в контракте ввода. */
export interface ReleaseInfo {
  readonly element: BoardElement
  readonly hand: HandId
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly thrown: boolean
}

export interface BoardEventMap {
  change: BoardState
  grab: { readonly element: BoardElement; readonly hand: HandId }
  drop: { readonly element: BoardElement; readonly hand: HandId }
  throw: { readonly element: BoardElement }
  remove: { readonly element: BoardElement }
  select: { readonly id?: string }
  hint: HintEvt
}

export interface BoardLayers {
  /** Корень доски. */
  readonly root: HTMLElement
  /** Слой в мировых координатах: всё внутри двигается и масштабируется с камерой. */
  readonly world: HTMLElement
  /** Экранный слой поверх доски, pointer-events: none. */
  readonly overlay: HTMLElement
}

export interface Board {
  addElement(spec: NewElement, opts?: AddOptions): BoardElement
  removeElement(id: string, opts?: RemoveOptions): void
  updateElement(id: string, patch: ElementPatch): void
  getElement(id: string): BoardElement | undefined
  getState(): BoardState
  /** Удерживаемый элемент и рука, если есть. */
  getHeld(): { readonly element: BoardElement; readonly hand: HandId } | undefined
  /** Верхний элемент под точкой экрана в долях 0..1. */
  elementAt(x: number, y: number): BoardElement | undefined
  toWorld(x: number, y: number): Point
  toScreen(p: Point): Point
  holdElement(id: string, hand: HandId): void
  setHeldScale(scale: number): void
  setCamera(camera: Camera): void
  select(id?: string): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
  subscribe(fn: (state: BoardState) => void): Unsubscribe
  on<K extends keyof BoardEventMap>(type: K, fn: (e: BoardEventMap[K]) => void): Unsubscribe
  /** Подсказка наружу, в общий слой подсказок S4. Доска шлёт сюда и свои подсказки. */
  emitHint(evt: HintEvt): void
  /** true из перехватчика — событие забрано, доска его не обрабатывает. */
  interceptGrab(fn: (e: GrabEvt) => boolean): Unsubscribe
  interceptRelease(fn: (e: ReleaseInfo) => boolean): Unsubscribe
  readonly layers: BoardLayers
  destroy(): void
}

const INPUT_TYPES: readonly InputEventType[] = ['cursor', 'grab', 'release', 'throw', 'point', 'zoom', 'pan', 'handlost']

/** Сдвиг позиции по умолчанию для подряд добавленных элементов, чтобы они не ложились друг на друга. */
const CASCADE_STEP = 28
const CASCADE_COUNT = 6

class BoardImpl implements Board {
  readonly layers: BoardLayers
  private store: BoardStore = createStore()
  private ctrl: ControllerState = initialController()
  private viewport: Viewport = { w: window.innerWidth, h: window.innerHeight }
  private readonly renderer: BoardRenderer
  private readonly cursors: CursorLayer
  private readonly toolbar: ToolbarView
  private readonly fx: BoardFx
  private readonly events = new Emitter<BoardEventMap>()
  private readonly grabHooks = new Set<(e: GrabEvt) => boolean>()
  private readonly releaseHooks = new Set<(e: ReleaseInfo) => boolean>()
  private readonly disposers: Unsubscribe[] = []
  private seq = 0
  private frame = 0
  /** Какой руке источник ввода в последний раз сказал, что она несёт элемент. */
  private carried: HandId | undefined

  constructor(host: HTMLElement, private readonly input: InputSource) {
    this.renderer = new BoardRenderer(host)
    this.layers = { root: this.renderer.root, world: this.renderer.world, overlay: this.renderer.overlay }
    this.cursors = new CursorLayer(this.renderer.overlay)
    this.toolbar = new ToolbarView(this.renderer.overlay)
    this.fx = new BoardFx(this.renderer, () => ({ camera: this.store.state.camera, viewport: this.viewport }))
    INPUT_TYPES.forEach((type) =>
      this.disposers.push(input.on(type, (e) => this.handle({ type, e } as ControllerInput))),
    )
    this.disposers.push(input.on('hint', (e) => this.events.emit('hint', e)))
    const onResize = () => this.resize()
    window.addEventListener('resize', onResize)
    this.disposers.push(() => window.removeEventListener('resize', onResize))
    this.renderAll()
  }

  addElement(spec: NewElement, opts: AddOptions = {}): BoardElement {
    const pos = this.defaultPosition(spec, opts.hold)
    const element = createElement({ ...spec, id: spec.id ?? this.newId(), ...pos })
    this.apply([{ type: 'add', element }], opts.animate === false ? [] : [{ type: 'appear', id: element.id }])
    if (opts.hold) this.holdElement(element.id, opts.hold)
    return this.getElement(element.id) ?? element
  }

  removeElement(id: string, opts: RemoveOptions = {}): void {
    const element = this.getElement(id)
    if (!element) return
    if (this.store.state.held?.id === id) this.handle({ type: 'consume', hand: this.store.state.held.hand })
    const anim = opts.animate ?? 'vanish'
    if (typeof anim === 'object') this.fx.flyTo(element, normToScreen(this.viewport, anim.x, anim.y))
    const effects: BoardEffect[] = anim === 'vanish' ? [{ type: 'vanish', element }] : []
    this.apply([{ type: 'remove', id }], effects)
    if (anim !== 'vanish') this.events.emit('remove', { element })
  }

  updateElement(id: string, patch: ElementPatch): void {
    this.apply([{ type: 'update', id, patch }], [])
  }

  getElement(id: string): BoardElement | undefined {
    return this.store.state.elements.find((e) => e.id === id)
  }

  getState(): BoardState {
    return this.store.state
  }

  getHeld(): { readonly element: BoardElement; readonly hand: HandId } | undefined {
    const held = this.store.state.held
    const element = held && this.getElement(held.id)
    return held && element ? { element, hand: held.hand } : undefined
  }

  elementAt(x: number, y: number): BoardElement | undefined {
    const cam = this.store.state.camera
    return hitTest(this.store.state.elements, this.toWorld(x, y), HIT_PAD_PX / cam.zoom)
  }

  toWorld(x: number, y: number): Point {
    return screenToWorld(this.store.state.camera, this.viewport, normToScreen(this.viewport, x, y))
  }

  toScreen(p: Point): Point {
    const s = worldToScreen(this.store.state.camera, this.viewport, p)
    return { x: s.x / this.viewport.w, y: s.y / this.viewport.h }
  }

  holdElement(id: string, hand: HandId): void {
    this.handle({ type: 'adopt', hand, id })
  }

  setHeldScale(scale: number): void {
    this.fx.setHeldScale(scale)
  }

  setCamera(camera: Camera): void {
    this.apply([{ type: 'setCamera', camera }], [])
  }

  select(id?: string): void {
    this.apply([id === undefined ? { type: 'select' } : { type: 'select', id }], [])
  }

  undo(): void {
    this.apply([{ type: 'undo' }], [])
  }

  redo(): void {
    this.apply([{ type: 'redo' }], [])
  }

  canUndo(): boolean {
    return this.store.past.length > 0 && !this.store.state.held
  }

  canRedo(): boolean {
    return this.store.future.length > 0 && !this.store.state.held
  }

  subscribe(fn: (state: BoardState) => void): Unsubscribe {
    return this.events.on('change', fn)
  }

  on<K extends keyof BoardEventMap>(type: K, fn: (e: BoardEventMap[K]) => void): Unsubscribe {
    return this.events.on(type, fn)
  }

  emitHint(evt: HintEvt): void {
    this.events.emit('hint', evt)
  }

  interceptGrab(fn: (e: GrabEvt) => boolean): Unsubscribe {
    this.grabHooks.add(fn)
    return () => this.grabHooks.delete(fn)
  }

  interceptRelease(fn: (e: ReleaseInfo) => boolean): Unsubscribe {
    this.releaseHooks.add(fn)
    return () => this.releaseHooks.delete(fn)
  }

  destroy(): void {
    if (this.carried) this.input.setCarrying?.(this.carried, false)
    this.carried = undefined
    this.disposers.splice(0).forEach((d) => d())
    cancelAnimationFrame(this.frame)
    this.cursors.destroy()
    this.toolbar.destroy()
    this.renderer.destroy()
    this.events.clear()
  }

  private handle(raw: ControllerInput): void {
    const input = this.intercept(raw)
    if (!input) return
    const ctx = { state: this.store.state, viewport: this.viewport, newId: () => this.newId(), now: performance.now() }
    const r = step(this.ctrl, input, ctx)
    this.ctrl = r.ctrl
    this.apply(r.actions, r.effects)
  }

  /** Перехватчики S3: grab над карманом, release в зоне кармана. */
  private intercept(input: ControllerInput): ControllerInput | undefined {
    if (input.type === 'grab' && [...this.grabHooks].some((fn) => fn(input.e))) return undefined
    if (input.type !== 'release' && input.type !== 'throw') return input
    const held = this.getHeld()
    if (!held || held.hand !== input.e.hand) return input
    const info: ReleaseInfo = { ...input.e, element: held.element, hand: held.hand, thrown: input.type === 'throw' }
    return [...this.releaseHooks].some((fn) => fn(info)) ? { type: 'consume', hand: held.hand } : input
  }

  private apply(actions: readonly BoardAction[], effects: readonly BoardEffect[]): void {
    const before = this.store.state
    this.store = actions.reduce(dispatch, this.store)
    const after = this.store.state
    const now = performance.now()
    effects.forEach((fx) => this.runLeaving(fx))
    this.renderAll()
    effects.forEach((fx) => this.runEffect(fx, now, before))
    if (after !== before) this.events.emit('change', after)
    if (after.selectedId !== before.selectedId) this.events.emit('select', { id: after.selectedId })
    this.syncCarry()
  }

  /**
   * Источнику ввода — кто несёт элемент. Камера по этому решает, прилипает ли захват: кулак
   * на пустом месте отпускается раскрытой ладонью, взятый элемент — только щелчком кулак → ладонь.
   * Элемент, ушедший из руки без жеста (карман, удаление), освобождает руку и у источника.
   */
  private syncCarry(): void {
    const hand = this.store.state.held?.hand
    if (hand === this.carried) return
    const prev = this.carried
    this.carried = hand
    if (prev) this.input.setCarrying?.(prev, false)
    if (hand) this.input.setCarrying?.(hand, true)
  }

  /** Эффекты ухода забирают узел до того, как рендер удалит его из DOM. */
  private runLeaving(fx: BoardEffect): void {
    if (fx.type === 'throw') this.fx.throwAway(fx.element, fx.vx, fx.vy)
    if (fx.type === 'vanish') this.fx.vanish(fx.element)
  }

  private runEffect(fx: BoardEffect, now: number, before: BoardState): void {
    const find = (id: string) => this.getElement(id) ?? before.elements.find((e) => e.id === id)
    switch (fx.type) {
      case 'lift': {
        this.fx.lift(fx.id, now)
        const element = find(fx.id)
        if (element) this.events.emit('grab', { element, hand: fx.hand })
        break
      }
      case 'drop': {
        this.fx.drop(fx.id, now)
        const element = find(fx.id)
        if (element) this.events.emit('drop', { element, hand: fx.hand })
        break
      }
      case 'throw':
        this.events.emit('throw', { element: fx.element })
        break
      case 'vanish':
        this.events.emit('remove', { element: fx.element })
        break
      case 'appear':
        this.fx.appear(fx.id)
        break
      case 'hint':
        this.events.emit('hint', fx.hint)
        break
    }
    this.startLoop()
  }

  private renderAll(): void {
    const state = this.store.state
    this.renderer.render(state, this.viewport)
    const hands = this.ctrl.hands
    const hoverIds = new Set<string>()
    const hoverActions = new Set<ToolbarAction>()
    Object.values(hands).forEach((h) => {
      if (h?.hoverId) hoverIds.add(h.hoverId)
      if (h?.hoverAction) hoverActions.add(h.hoverAction)
    })
    this.renderer.setHover(hoverIds)
    this.toolbar.render(state, this.viewport, hoverActions)
    this.cursors.update(hands, state.held?.hand)
    this.startLoop()
  }

  private startLoop(): void {
    if (this.frame || !this.fx.active) return
    this.fx.resetClock()
    const loop = (t: number) => {
      this.fx.tick(t)
      this.frame = this.fx.active ? requestAnimationFrame(loop) : 0
    }
    this.frame = requestAnimationFrame(loop)
  }

  private resize(): void {
    this.viewport = { w: window.innerWidth, h: window.innerHeight }
    this.renderAll()
  }

  private defaultPosition(spec: NewElement, hold: HandId | undefined): Point {
    if (spec.x !== undefined && spec.y !== undefined) return { x: spec.x, y: spec.y }
    const hand = hold && this.ctrl.hands[hold]
    if (hand) return screenToWorld(this.store.state.camera, this.viewport, hand)
    const k = (this.seq % CASCADE_COUNT) - (CASCADE_COUNT - 1) / 2
    const cam = this.store.state.camera
    return { x: cam.x + (k * CASCADE_STEP) / cam.zoom, y: cam.y + (k * CASCADE_STEP) / cam.zoom }
  }

  private newId(): string {
    this.seq += 1
    return `el-${Date.now().toString(36)}-${this.seq}`
  }
}

export function createBoardApi(root: HTMLElement, input: InputSource): Board {
  return new BoardImpl(root, input)
}
