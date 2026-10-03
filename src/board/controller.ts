import type {
  CursorEvt,
  GrabEvt,
  HandId,
  HandLostEvt,
  HintEvt,
  PanEvt,
  PointEvt,
  ReleaseEvt,
  TiltEvt,
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
/** Кулак на пустом месте, сдвинутый дальше этого, — попытка тянуть доску: подсказка про два пальца. */
export const GRIP_HINT_MOVE_PX = 40
/** Подсказка про два пальца не чаще этого. */
export const GRIP_HINT_COOLDOWN_MS = 4000
/** Щипок над элементом стоит без движения дольше этого — человек пытается взять щипком. */
export const PINCH_GRAB_HINT_MS = 1000
/** Подсказка «бери кулаком» не чаще этого. */
export const PINCH_GRAB_HINT_COOLDOWN_MS = 5000

export const BOARD_HINTS = {
  RELEASE_EDGE: { code: 'BOARD_RELEASE_EDGE', message: 'Клади элемент над доской, а не за её краем', severity: 'warn' },
  TOOLBAR_POINT: {
    code: 'BOARD_TOOLBAR_POINT',
    message: 'Укажи на кнопку одним пальцем и задержи руку, чтобы выбрать действие',
    severity: 'info',
  },
  ZOOM_MAX: { code: 'BOARD_ZOOM_MAX', message: 'Сведи руки, чтобы отдалить доску', severity: 'info' },
  ZOOM_MIN: { code: 'BOARD_ZOOM_MIN', message: 'Разведи руки, чтобы приблизить доску', severity: 'info' },
  ZOOM_MAX_PINCH: { code: 'BOARD_ZOOM_MAX', message: 'Веди щипок вниз, чтобы отдалить доску', severity: 'info' },
  ZOOM_MIN_PINCH: { code: 'BOARD_ZOOM_MIN', message: 'Веди щипок вверх, чтобы приблизить доску', severity: 'info' },
  PINCH_GRAB: {
    code: 'BOARD_PINCH_GRAB',
    message: 'Чтобы взять элемент, сожми кулак. Щипок с движением вверх или вниз меняет масштаб',
    severity: 'warn',
  },
  GRIP_PAN: {
    code: 'BOARD_GRIP_PAN',
    message: 'Чтобы двигать доску, покажи два пальца — указательный и средний',
    severity: 'warn',
  },
} as const satisfies Record<string, HintEvt>

/**
 * hold — держит элемент. grip — кулак на пустом месте: ничего не делает, но нужен зуму двумя руками.
 * pan — жест двух пальцев, доска едет за рукой. zoom — щипок, доска масштабируется ходом руки.
 */
export type HandMode = 'idle' | 'hold' | 'grip' | 'pan' | 'zoom'

export interface HandState {
  readonly x: number
  readonly y: number
  readonly closure: number
  readonly mode: HandMode
  /** false — рука в бездействии, курсор на паузе. undefined — источник без распознавания бездействия. */
  readonly engaged?: boolean
  readonly hoverId?: string
  readonly hoverAction?: ToolbarAction
  /** Где кулак сжался на пустом месте, пиксели экрана. */
  readonly gripFrom?: Point
  /** Элемент под прицелом, когда сомкнулся щипок: возможно, его пытаются взять щипком. */
  readonly pinchOn?: string
  /** С какого момента щипок не зумил, мс. */
  readonly pinchStillSince?: number
}

export interface ControllerState {
  readonly hands: Partial<Record<HandId, HandState>>
  /** Идёт жест двумя руками: панорама одной рукой приостановлена. */
  readonly zooming: boolean
  readonly zoomLimit?: 'min' | 'max'
  /** Когда последний раз подсказали, что доску двигают двумя пальцами, а не кулаком. */
  readonly gripHintAt?: number
  /** Когда последний раз подсказали, что элемент берут кулаком, а не щипком. */
  readonly pinchHintAt?: number
}

export type ControllerInput =
  | { readonly type: 'cursor'; readonly e: CursorEvt }
  | { readonly type: 'grab'; readonly e: GrabEvt }
  | { readonly type: 'release'; readonly e: ReleaseEvt }
  | { readonly type: 'throw'; readonly e: ReleaseEvt }
  | { readonly type: 'point'; readonly e: PointEvt }
  | { readonly type: 'zoom'; readonly e: ZoomEvt }
  | { readonly type: 'pan'; readonly e: PanEvt }
  | { readonly type: 'tilt'; readonly e: TiltEvt }
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
  /** Время в мс для редких подсказок. Без него подсказка про кулак не ограничена по частоте. */
  readonly now?: number
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

const withoutHover = (h: HandState): HandState => {
  const { hoverId: _h, hoverAction: _a, ...plain } = h
  return plain
}

const withoutPinch = (h: HandState): HandState => {
  const { pinchOn: _o, pinchStillSince: _s, ...plain } = h
  return plain
}

/**
 * Кулак на пустом месте, который тянут, — человек пытается двигать доску по-старому.
 * Подсказка не во время зума двумя кулаками и не чаще GRIP_HINT_COOLDOWN_MS.
 */
function gripHint(c: ControllerState, hand: HandId, h: HandState, ctx: StepContext): StepResult {
  const from = h.gripFrom
  const moved = from !== undefined && Math.hypot(h.x - from.x, h.y - from.y) > GRIP_HINT_MOVE_PX
  const now = ctx.now ?? 0
  const cooled = c.gripHintAt === undefined || ctx.now === undefined || now - c.gripHintAt >= GRIP_HINT_COOLDOWN_MS
  const twoFists = handOf(c, other(hand)).mode === 'grip'
  if (!moved || !cooled || twoFists || c.zooming) return result(c)
  return result({ ...c, gripHintAt: now }, [], [{ type: 'hint', hint: BOARD_HINTS.GRIP_PAN }])
}

function onCursor(c: ControllerState, e: CursorEvt, ctx: StepContext): StepResult {
  const prev = handOf(c, e.hand)
  const p = normToScreen(ctx.viewport, e.x, e.y)
  const base: HandState = { ...prev, x: p.x, y: p.y, closure: e.closure, ...(e.engaged !== undefined ? { engaged: e.engaged } : {}) }
  if (prev.mode === 'hold') {
    const next = setHand(c, e.hand, base)
    return heldBy(ctx.state, e.hand) ? result(next, [{ type: 'dragTo', ...worldAt(ctx, p) }]) : result(next)
  }
  if (prev.mode === 'grip') return gripHint(setHand(c, e.hand, base), e.hand, base, ctx)
  // Во время панорамы и зума доска двигается под курсором, фокус и подсветка выключены.
  if (e.panning === true) return result(setHand(c, e.hand, { ...withoutHover(base), mode: 'pan' }))
  if (e.zooming === true) return onPinchCursor(c, e.hand, base, p, ctx)
  const gesture = prev.mode === 'pan' || prev.mode === 'zoom'
  const free: HandState = gesture ? { ...withoutPinch(base), mode: 'idle' } : base
  return hover(setHand(c, e.hand, free), e.hand, free, p, ctx)
}

/**
 * Щипок зумит доску и ничего не берёт. Если он сомкнулся над элементом и стоит без зума дольше
 * PINCH_GRAB_HINT_MS, человек, скорее всего, пытается взять элемент щипком: подсказка про кулак.
 */
function onPinchCursor(c: ControllerState, hand: HandId, base: HandState, p: Point, ctx: StepContext): StepResult {
  if (base.mode !== 'zoom') {
    const on = elementAt(ctx, p, base.hoverId)?.id
    const since = ctx.now !== undefined ? { pinchStillSince: ctx.now } : {}
    return result(setHand(c, hand, { ...withoutHover(withoutPinch(base)), mode: 'zoom', ...(on ? { pinchOn: on } : {}), ...since }))
  }
  const next = setHand(c, hand, base)
  const now = ctx.now
  if (!base.pinchOn || now === undefined || base.pinchStillSince === undefined) return result(next)
  const still = now - base.pinchStillSince >= PINCH_GRAB_HINT_MS
  const cooled = c.pinchHintAt === undefined || now - c.pinchHintAt >= PINCH_GRAB_HINT_COOLDOWN_MS
  if (!still || !cooled) return result(next)
  return result({ ...next, pinchHintAt: now }, [], [{ type: 'hint', hint: BOARD_HINTS.PINCH_GRAB }])
}

function hover(c: ControllerState, hand: HandId, h: HandState, p: Point, ctx: StepContext): StepResult {
  const prev = handOf(c, hand)
  const layout = selectedLayout(ctx)
  const hoverAction = layout ? toolbarHit(layout, p) : undefined
  const hoverId = hoverAction ? undefined : elementAt(ctx, p, prev.hoverId)?.id
  return result(setHand(c, hand, { ...withoutHover(h), ...(hoverId ? { hoverId } : {}), ...(hoverAction ? { hoverAction } : {}) }))
}

/** Доска едет за рукой с двумя пальцами. Во время зума двумя руками и при удержании — нет. */
function onPan(c: ControllerState, e: PanEvt, ctx: StepContext): StepResult {
  const h = handOf(c, e.hand)
  if (c.zooming || h.mode === 'hold' || h.mode === 'grip') return result(c)
  const next = setHand(c, e.hand, { ...withoutHover(h), mode: 'pan' })
  return result(next, [{ type: 'pan', dx: e.dx * ctx.viewport.w, dy: e.dy * ctx.viewport.h }])
}

/**
 * Наклон плоскости доски ходом щипка вбок. Рука в это время уже в режиме зума, поэтому
 * состояние руки трогать не надо: меняется только сцена.
 */
function onTilt(c: ControllerState, e: TiltEvt): StepResult {
  return result(c, [{ type: 'tilt', delta: e.delta }])
}

function onGrab(c: ControllerState, e: GrabEvt, ctx: StepContext): StepResult {
  const p = normToScreen(ctx.viewport, e.x, e.y)
  const hand: HandState = { ...handOf(c, e.hand), x: p.x, y: p.y, closure: 1 }
  const layout = selectedLayout(ctx)
  if (layout && toolbarHit(layout, p)) {
    return result(setHand(c, e.hand, { ...hand, mode: 'idle' }), [], [{ type: 'hint', hint: BOARD_HINTS.TOOLBAR_POINT }])
  }
  const target = elementAt(ctx, p, handOf(c, e.hand).hoverId)
  if (target && !ctx.state.held) return grabElement(setHand(c, e.hand, hand), e.hand, target, worldAt(ctx, p), ctx)
  // Кулак на пустом месте доску не двигает: это делает жест двух пальцев.
  if (target) return result(setHand(c, e.hand, { ...hand, mode: 'idle' }))
  return result(setHand(c, e.hand, { ...withoutHover(hand), mode: 'grip', gripFrom: p }))
}

function grabElement(c: ControllerState, hand: HandId, el: BoardElement, w: Point, ctx: StepContext): StepResult {
  const h = handOf(c, hand)
  const { hoverId: _h, ...rest } = h
  const actions: BoardAction[] = [{ type: 'grab', hand, id: el.id, dx: el.x - w.x, dy: el.y - w.y }]
  if (ctx.state.selectedId && ctx.state.selectedId !== el.id) actions.unshift({ type: 'select' })
  return result(setHand(c, hand, { ...rest, mode: 'hold' }), actions, [{ type: 'lift', id: el.id, hand }])
}

function endHand(c: ControllerState, hand: HandId): ControllerState {
  const { gripFrom: _g, ...h } = handOf(c, hand)
  const next = setHand(c, hand, { ...h, mode: 'idle', closure: 0 })
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

const isFist = (h: HandState | undefined): boolean => h?.mode === 'grip' || h?.mode === 'hold'

/** Щипок зумит: отсчёт «стоит без движения» начинается заново. */
function pinchMoved(hands: ControllerState['hands'], now: number | undefined): ControllerState['hands'] {
  if (now === undefined) return hands
  const entries = Object.entries(hands).map(([k, h]) => [k, h?.mode === 'zoom' ? { ...h, pinchStillSince: now } : h])
  return Object.fromEntries(entries) as ControllerState['hands']
}

function limitHint(limit: 'min' | 'max', pinch: boolean): HintEvt {
  if (pinch) return limit === 'max' ? BOARD_HINTS.ZOOM_MAX_PINCH : BOARD_HINTS.ZOOM_MIN_PINCH
  return limit === 'max' ? BOARD_HINTS.ZOOM_MAX : BOARD_HINTS.ZOOM_MIN
}

/** Зум двумя кулаками, щипком одной рукой или колесом. Упор в предел подсказывает, куда вести. */
function onZoom(c: ControllerState, e: ZoomEvt, ctx: StepContext): StepResult {
  const cam = ctx.state.camera
  const wanted = cam.zoom * e.factor
  const limit = wanted > ZOOM_MAX ? 'max' : wanted < ZOOM_MIN ? 'min' : undefined
  const twoFists = isFist(c.hands.left) && isFist(c.hands.right)
  const pinch = Object.values(c.hands).some((h) => h?.mode === 'zoom')
  const { zoomLimit: _z, ...plain } = c
  const hands = pinchMoved(c.hands, ctx.now)
  const next: ControllerState = { ...plain, hands, zooming: c.zooming || twoFists, ...(limit ? { zoomLimit: limit } : {}) }
  const ox = e.cx * ctx.viewport.w - ctx.viewport.w / 2
  const oy = e.cy * ctx.viewport.h - ctx.viewport.h / 2
  const fresh = limit && limit !== c.zoomLimit
  const effects: BoardEffect[] = fresh ? [{ type: 'hint', hint: limitHint(limit, pinch) }] : []
  return result(next, [{ type: 'zoom', factor: e.factor, ox, oy }], effects)
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
    case 'pan':
      return onPan(c, input.e, ctx)
    case 'tilt':
      return onTilt(c, input.e)
    case 'handlost':
      return onLost(c, input.e.hand, ctx)
    case 'consume':
      return heldBy(ctx.state, input.hand) ? result(endHand(c, input.hand), [{ type: 'release' }]) : result(c)
    case 'adopt':
      return onAdopt(c, input.hand, input.id, ctx)
  }
}
