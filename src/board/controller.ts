import type {
  CursorEvt,
  GrabEvt,
  HandId,
  HandLostEvt,
  HintEvt,
  PointEvt,
  ReleaseEvt,
  ZoomEvt,
} from '../contracts/input'
import { FOCUS_RADIUS_PX, FOCUS_STICKY_PX, focusAt } from './focus'
import { clampToView, normToScreen, screenToWorld, type Point, type Viewport } from './geometry'
import { nextColor, type BoardElement, type BoardState } from './model'
import { ZOOM_MAX, ZOOM_MIN, type BoardAction } from './store'
import { toolbarHit, toolbarLayout, type ToolbarAction } from './toolbar'

/** Запас попадания по элементу в пикселях экрана: прицел руки дрожит. */
export const HIT_PAD_PX = 10
/** Отпускание ближе этой доли экрана к краю считается «за краем». */
export const EDGE_ZONE = 0.02
/** Элемент после отпускания остаётся хотя бы на столько пикселей внутри экрана. */
export const KEEP_VISIBLE_PX = 40
/** Смещение копии при дублировании, мировые единицы. */
export const DUPLICATE_OFFSET = 32

export const BOARD_HINTS = {
  RELEASE_EDGE: { code: 'BOARD_RELEASE_EDGE', message: 'Отпусти элемент над доской, а не за её краем', severity: 'warn' },
  TOOLBAR_POINT: {
    code: 'BOARD_TOOLBAR_POINT',
    message: 'Укажи на кнопку одним пальцем и задержи руку, чтобы выбрать действие',
    severity: 'info',
  },
  ZOOM_MAX: { code: 'BOARD_ZOOM_MAX', message: 'Сведи руки, чтобы отдалить доску', severity: 'info' },
  ZOOM_MIN: { code: 'BOARD_ZOOM_MIN', message: 'Разведи руки, чтобы приблизить доску', severity: 'info' },
} as const satisfies Record<string, HintEvt>

export type HandMode = 'idle' | 'hold' | 'pan'

export interface HandState {
  readonly x: number
  readonly y: number
  readonly closure: number
  readonly mode: HandMode
  readonly hoverId?: string
  readonly hoverAction?: ToolbarAction
}

export interface ControllerState {
  readonly hands: Partial<Record<HandId, HandState>>
  /** Идёт жест двумя руками: панорама одной рукой приостановлена. */
  readonly zooming: boolean
  readonly zoomLimit?: 'min' | 'max'
}

export type ControllerInput =
  | { readonly type: 'cursor'; readonly e: CursorEvt }
  | { readonly type: 'grab'; readonly e: GrabEvt }
  | { readonly type: 'release'; readonly e: ReleaseEvt }
  | { readonly type: 'throw'; readonly e: ReleaseEvt }
  | { readonly type: 'point'; readonly e: PointEvt }
  | { readonly type: 'zoom'; readonly e: ZoomEvt }
  | { readonly type: 'handlost'; readonly e: HandLostEvt }
  /** Отпускание перехвачено снаружи (карман): снять удержание без анимации падения. */
  | { readonly type: 'consume'; readonly hand: HandId }
  /** Элемент уже существует и сразу оказывается в руке. */
  | { readonly type: 'adopt'; readonly hand: HandId; readonly id: string }

/** vx, vy броска в пикселях экрана в секунду. */
export type BoardEffect =
  | { readonly type: 'lift'; readonly id: string; readonly hand: HandId }
  | { readonly type: 'drop'; readonly id: string; readonly hand: HandId }
  | { readonly type: 'throw'; readonly element: BoardElement; readonly vx: number; readonly vy: number }
  | { readonly type: 'vanish'; readonly element: BoardElement }
  | { readonly type: 'appear'; readonly id: string }
  | { readonly type: 'hint'; readonly hint: HintEvt }

export interface StepContext {
  readonly state: BoardState
  readonly viewport: Viewport
  readonly newId: () => string
}

export interface StepResult {
  readonly ctrl: ControllerState
  readonly actions: readonly BoardAction[]
  readonly effects: readonly BoardEffect[]
}

export const initialController = (): ControllerState => ({ hands: {}, zooming: false })

const IDLE: HandState = { x: 0, y: 0, closure: 0, mode: 'idle' }

const handOf = (c: ControllerState, hand: HandId): HandState => c.hands[hand] ?? IDLE

const setHand = (c: ControllerState, hand: HandId, h: HandState): ControllerState => ({
  ...c,
  hands: { ...c.hands, [hand]: h },
})

const result = (ctrl: ControllerState, actions: BoardAction[] = [], effects: BoardEffect[] = []): StepResult => ({
  ctrl,
  actions,
  effects,
})

const other = (hand: HandId): HandId => (hand === 'left' ? 'right' : 'left')

const heldBy = (s: BoardState, hand: HandId): string | undefined => (s.held?.hand === hand ? s.held.id : undefined)

const selectedLayout = (ctx: StepContext) => {
  const sel = ctx.state.elements.find((e) => e.id === ctx.state.selectedId)
  return sel ? toolbarLayout(sel, ctx.state.camera, ctx.viewport) : undefined
}

function worldAt(ctx: StepContext, p: Point): Point {
  return screenToWorld(ctx.state.camera, ctx.viewport, p)
}

/** Элемент в магнитном фокусе руки: ближайший в радиусе, прошлый фокус удерживается. */
function elementAt(ctx: StepContext, p: Point, currentId?: string): BoardElement | undefined {
  const z = ctx.state.camera.zoom
  return focusAt(ctx.state.elements, worldAt(ctx, p), FOCUS_RADIUS_PX / z, FOCUS_STICKY_PX / z, currentId)
}

function onCursor(c: ControllerState, e: CursorEvt, ctx: StepContext): StepResult {
  const prev = handOf(c, e.hand)
  const p = normToScreen(ctx.viewport, e.x, e.y)
  const base: HandState = { ...prev, x: p.x, y: p.y, closure: e.closure }
  if (prev.mode === 'hold') {
    const next = setHand(c, e.hand, base)
    return heldBy(ctx.state, e.hand) ? result(next, [{ type: 'dragTo', ...worldAt(ctx, p) }]) : result(next)
  }
  if (prev.mode === 'pan') {
    const next = setHand(c, e.hand, base)
    return c.zooming ? result(next) : result(next, [{ type: 'pan', dx: p.x - prev.x, dy: p.y - prev.y }])
  }
  const layout = selectedLayout(ctx)
  const hoverAction = layout ? toolbarHit(layout, p) : undefined
  const hoverId = hoverAction ? undefined : elementAt(ctx, p, prev.hoverId)?.id
  const { hoverId: _h, hoverAction: _a, ...plain } = base
  return result(setHand(c, e.hand, { ...plain, ...(hoverId ? { hoverId } : {}), ...(hoverAction ? { hoverAction } : {}) }))
}

function onGrab(c: ControllerState, e: GrabEvt, ctx: StepContext): StepResult {
  const p = normToScreen(ctx.viewport, e.x, e.y)
  const hand: HandState = { ...handOf(c, e.hand), x: p.x, y: p.y, closure: 1 }
  const otherBusy = handOf(c, other(e.hand)).mode !== 'idle'
  const layout = selectedLayout(ctx)
  if (layout && toolbarHit(layout, p)) {
    return result(setHand(c, e.hand, { ...hand, mode: 'idle' }), [], [{ type: 'hint', hint: BOARD_HINTS.TOOLBAR_POINT }])
  }
  const target = elementAt(ctx, p, handOf(c, e.hand).hoverId)
  if (target && !ctx.state.held) return grabElement(setHand(c, e.hand, hand), e.hand, target, worldAt(ctx, p), ctx)
  const mode = otherBusy || target ? 'idle' : 'pan'
  return result(setHand(c, e.hand, { ...hand, mode }))
}

function grabElement(c: ControllerState, hand: HandId, el: BoardElement, w: Point, ctx: StepContext): StepResult {
  const h = handOf(c, hand)
  const { hoverId: _h, ...rest } = h
  const actions: BoardAction[] = [{ type: 'grab', hand, id: el.id, dx: el.x - w.x, dy: el.y - w.y }]
  if (ctx.state.selectedId && ctx.state.selectedId !== el.id) actions.unshift({ type: 'select' })
  return result(setHand(c, hand, { ...rest, mode: 'hold' }), actions, [{ type: 'lift', id: el.id, hand }])
}

function endHand(c: ControllerState, hand: HandId): ControllerState {
  const next = setHand(c, hand, { ...handOf(c, hand), mode: 'idle', closure: 0 })
  const anyActive = Object.values(next.hands).some((h) => h?.mode !== 'idle')
  return anyActive ? next : { ...next, zooming: false }
}

function onRelease(c: ControllerState, e: ReleaseEvt, ctx: StepContext): StepResult {
  const id = heldBy(ctx.state, e.hand)
  const held = ctx.state.held
  const next = endHand(c, e.hand)
  if (!id || !held) return result(next)
  const p = normToScreen(ctx.viewport, e.x, e.y)
  const cam = ctx.state.camera
  const w = worldAt(ctx, p)
  const target = clampToView(cam, ctx.viewport, { x: w.x + held.dx, y: w.y + held.dy }, KEEP_VISIBLE_PX)
  const actions: BoardAction[] = [{ type: 'dragTo', x: target.x - held.dx, y: target.y - held.dy }, { type: 'release' }]
  const effects: BoardEffect[] = [{ type: 'drop', id, hand: e.hand }]
  const nearEdge = [e.x, e.y].some((v) => v < EDGE_ZONE || v > 1 - EDGE_ZONE)
  return result(next, actions, nearEdge ? [...effects, { type: 'hint', hint: BOARD_HINTS.RELEASE_EDGE }] : effects)
}

function onThrow(c: ControllerState, e: ReleaseEvt, ctx: StepContext): StepResult {
  const id = heldBy(ctx.state, e.hand)
  const element = ctx.state.elements.find((el) => el.id === id)
  if (!id || !element) return result(endHand(c, e.hand))
  const vx = e.vx * ctx.viewport.w
  const vy = e.vy * ctx.viewport.h
  return result(endHand(c, e.hand), [{ type: 'release' }, { type: 'remove', id }], [{ type: 'throw', element, vx, vy }])
}

function runToolbar(action: ToolbarAction, el: BoardElement, ctx: StepContext): Omit<StepResult, 'ctrl'> {
  switch (action) {
    case 'duplicate': {
      const newId = ctx.newId()
      const d = DUPLICATE_OFFSET
      return { actions: [{ type: 'duplicate', id: el.id, newId, dx: d, dy: d }], effects: [{ type: 'appear', id: newId }] }
    }
    case 'color':
      return { actions: [{ type: 'update', id: el.id, patch: { color: nextColor(el.kind, el.color) } }], effects: [] }
    case 'delete':
      return { actions: [{ type: 'remove', id: el.id }], effects: [{ type: 'vanish', element: el }] }
  }
}

function onPoint(c: ControllerState, e: PointEvt, ctx: StepContext): StepResult {
  const p = normToScreen(ctx.viewport, e.x, e.y)
  const selected = ctx.state.elements.find((el) => el.id === ctx.state.selectedId)
  const action = selected ? toolbarHit(toolbarLayout(selected, ctx.state.camera, ctx.viewport), p) : undefined
  if (selected && action) {
    const r = runToolbar(action, selected, ctx)
    return result(c, [...r.actions], [...r.effects])
  }
  const target = elementAt(ctx, p, handOf(c, e.hand).hoverId)
  if (target?.id === ctx.state.selectedId) return result(c)
  return result(c, [target ? { type: 'select', id: target.id } : { type: 'select' }])
}

function onZoom(c: ControllerState, e: ZoomEvt, ctx: StepContext): StepResult {
  const cam = ctx.state.camera
  const wanted = cam.zoom * e.factor
  const limit = wanted > ZOOM_MAX ? 'max' : wanted < ZOOM_MIN ? 'min' : undefined
  const twoHands = c.hands.left !== undefined && c.hands.right !== undefined
  const { zoomLimit: _z, ...plain } = c
  const next: ControllerState = { ...plain, zooming: c.zooming || twoHands, ...(limit ? { zoomLimit: limit } : {}) }
  const ox = e.cx * ctx.viewport.w - ctx.viewport.w / 2
  const oy = e.cy * ctx.viewport.h - ctx.viewport.h / 2
  const fresh = limit && limit !== c.zoomLimit
  const hint = limit === 'max' ? BOARD_HINTS.ZOOM_MAX : BOARD_HINTS.ZOOM_MIN
  return result(next, [{ type: 'zoom', factor: e.factor, ox, oy }], fresh ? [{ type: 'hint', hint }] : [])
}

function onLost(c: ControllerState, hand: HandId, ctx: StepContext): StepResult {
  const id = heldBy(ctx.state, hand)
  const rest = { ...c.hands }
  delete rest[hand]
  const anyActive = Object.values(rest).some((h) => h?.mode !== 'idle')
  const next: ControllerState = { ...c, hands: rest, zooming: anyActive && c.zooming }
  return id ? result(next, [{ type: 'release' }], [{ type: 'drop', id, hand }]) : result(next)
}

function onAdopt(c: ControllerState, hand: HandId, id: string, ctx: StepContext): StepResult {
  const el = ctx.state.elements.find((e) => e.id === id)
  if (!el || ctx.state.held) return result(c)
  const h = { ...handOf(c, hand), closure: 1 }
  return grabElement(setHand(c, hand, h), hand, el, { x: el.x, y: el.y }, ctx)
}

/** Чистый шаг контроллера: событие ввода и текущее состояние доски превращаются в действия и эффекты. */
export function step(c: ControllerState, input: ControllerInput, ctx: StepContext): StepResult {
  switch (input.type) {
    case 'cursor':
      return onCursor(c, input.e, ctx)
    case 'grab':
      return onGrab(c, input.e, ctx)
    case 'release':
      return onRelease(c, input.e, ctx)
    case 'throw':
      return onThrow(c, input.e, ctx)
    case 'point':
      return onPoint(c, input.e, ctx)
    case 'zoom':
      return onZoom(c, input.e, ctx)
    case 'handlost':
      return onLost(c, input.e.hand, ctx)
    case 'consume':
      return heldBy(ctx.state, input.hand) ? result(endHand(c, input.hand), [{ type: 'release' }]) : result(c)
    case 'adopt':
      return onAdopt(c, input.hand, input.id, ctx)
  }
}
