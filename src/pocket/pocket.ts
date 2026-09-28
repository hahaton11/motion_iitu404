import type { Board, BoardElement, ReleaseInfo } from '../board'
import type { CursorEvt, GrabEvt, HandId, InputSource } from '../contracts/input'
import { TypedEmitter, type Unsubscribe } from './emitter'
import { fanLayout, fanRegionTop, POCKET_HEIGHT, type FanSlot, type Viewport } from './fan'
import {
  addItem,
  emptyPocket,
  hiddenCounts,
  makeItem,
  removeItem,
  scrollBy,
  setItems,
  stashElement,
  takeItem,
  visibleItems,
  type PocketContent,
  type PocketItem,
  type PocketState,
} from './model'
import { openPocketStore, type PocketStore } from './storage'
import { PocketView } from './view'
import {
  hintAllowed,
  inPocket,
  initialZone,
  nearPocket,
  pickCard,
  POCKET_HINTS,
  stepZone,
  type HandZone,
  type ZoneEvent,
} from './zone'

/** Масштаб удерживаемого элемента над карманом. */
export const HELD_SCALE_OVER = 0.55

export interface PocketEventMap {
  change: readonly PocketItem[]
  put: { readonly item: PocketItem; readonly element: BoardElement }
  take: { readonly item: PocketItem; readonly element: BoardElement }
  open: undefined
  close: undefined
  prep: { readonly on: boolean }
}

export interface Pocket {
  /** Разрешается, когда содержимое загружено из хранилища. */
  readonly ready: Promise<void>
  getItems(): readonly PocketItem[]
  isOpen(): boolean
  addPreset(content: PocketContent): PocketItem
  removeItem(id: string): void
  /** Вернуть заготовки по умолчанию. */
  reset(): Promise<void>
  setPrepMode(on: boolean): void
  isPrepMode(): boolean
  on<K extends keyof PocketEventMap>(type: K, fn: (e: PocketEventMap[K]) => void): Unsubscribe
  destroy(): void
}

export interface PocketOptions {
  /** Своё хранилище, например в памяти для тестов. По умолчанию IndexedDB. */
  readonly store?: Promise<PocketStore>
}

interface HandInfo {
  readonly zone: HandZone
  readonly x: number
  readonly y: number
  readonly carrying: boolean
}

const viewport = (): Viewport => ({ w: window.innerWidth, h: window.innerHeight })

/** Карман: связывает ввод, доску, модель, зону и вид. */
export class PocketController implements Pocket {
  readonly ready: Promise<void>
  private state: PocketState = emptyPocket()
  private hands = new Map<HandId, HandInfo>()
  private hintsAt: Readonly<Record<string, number>> = {}
  private prep = false
  private heldScale = 1
  private seq = 0
  private frame = 0
  private readonly view: PocketView
  private readonly events = new TypedEmitter<PocketEventMap>()
  private readonly disposers: Unsubscribe[] = []
  private store: PocketStore | undefined

  constructor(root: HTMLElement, input: InputSource, private readonly board: Board, opts: PocketOptions = {}) {
    this.view = new PocketView(board.layers.root, board.layers.world, root)
    this.disposers.push(
      input.on('cursor', (e) => this.onCursor(e)),
      input.on('handlost', (e) => this.onLost(e.hand)),
      board.interceptGrab((e) => this.onGrab(e)),
      board.interceptRelease((e) => this.onRelease(e)),
    )
    const onResize = () => this.render()
    window.addEventListener('resize', onResize)
    this.disposers.push(() => window.removeEventListener('resize', onResize))
    this.ready = this.load(opts.store ?? openPocketStore())
    this.render()
  }

  getItems(): readonly PocketItem[] {
    return this.state.items
  }

  isOpen(): boolean {
    return [...this.hands.values()].some((h) => h.zone.phase === 'open')
  }

  addPreset(content: PocketContent): PocketItem {
    const item = makeItem(this.newId(), 'preset', content, Date.now())
    this.commit(addItem(this.state, item))
    return item
  }

  removeItem(id: string): void {
    this.commit(removeItem(this.state, id))
  }

  async reset(): Promise<void> {
    const store = this.store
    if (!store) return
    this.commit(setItems(this.state, await store.reset()), false)
  }

  setPrepMode(on: boolean): void {
    if (on === this.prep) return
    const wasOpen = this.isOpen()
    this.prep = on
    this.hands = new Map([...this.hands].map(([hand, h]) => [hand, { ...h, zone: initialZone() }]))
    this.applyHeldScale(1)
    if (wasOpen) this.events.emit('close', undefined)
    this.events.emit('prep', { on })
    this.render()
  }

  isPrepMode(): boolean {
    return this.prep
  }

  on<K extends keyof PocketEventMap>(type: K, fn: (e: PocketEventMap[K]) => void): Unsubscribe {
    return this.events.on(type, fn)
  }

  destroy(): void {
    this.disposers.splice(0).forEach((d) => d())
    cancelAnimationFrame(this.frame)
    this.applyHeldScale(1)
    this.view.destroy()
    this.events.clear()
  }

  private async load(storeP: Promise<PocketStore>): Promise<void> {
    const store = await storeP
    this.store = store
    const loaded = await store.load()
    const known = new Set(loaded.map((i) => i.id))
    const extra = this.state.items.filter((i) => !known.has(i.id))
    this.commit(setItems(this.state, [...extra, ...loaded]), extra.length > 0)
  }

  private commit(next: PocketState, persist = true): void {
    const changed = next.items !== this.state.items
    this.state = next
    if (changed && persist) void this.store?.save(next.items).catch(() => undefined)
    if (changed) this.events.emit('change', next.items)
    this.render()
  }

  private slots(vp: Viewport = viewport()): readonly FanSlot[] {
    return fanLayout(visibleItems(this.state).length, vp)
  }

  private onCursor(e: CursorEvt): void {
    const vp = viewport()
    const carrying = this.board.getHeld()?.hand === e.hand
    const prev = this.hands.get(e.hand)?.zone ?? initialZone()
    const fanTop = fanRegionTop(this.slots(vp), vp)
    const input = { type: 'cursor', x: e.x, y: e.y, closure: e.closure, carrying, fist: e.holding, t: performance.now() } as const
    const r = this.prep ? { zone: initialZone(), events: [] } : stepZone(prev, input, { fanTop })
    this.hands.set(e.hand, { zone: r.zone, x: e.x, y: e.y, carrying })
    this.handleEvents(r.events)
    const over = !this.prep && carrying && inPocket(e.y)
    if (carrying) this.applyHeldScale(over ? HELD_SCALE_OVER : 1)
    this.render()
    this.ensureTicking()
  }

  private onLost(hand: HandId): void {
    const h = this.hands.get(hand)
    if (!h) return
    this.hands.delete(hand)
    this.handleEvents(stepZone(h.zone, { type: 'lost' }, { fanTop: 0 }).events)
    this.render()
  }

  private handleEvents(events: readonly ZoneEvent[]): void {
    events.forEach((ev) => {
      if (ev.type === 'open') this.events.emit('open', undefined)
      if (ev.type === 'close' && !this.isOpen()) this.events.emit('close', undefined)
      if (ev.type === 'scroll') this.commit(scrollBy(this.state, ev.delta), false)
      if (ev.type === 'hint') this.hint(ev.key)
    })
  }

  private hint(key: keyof typeof POCKET_HINTS): void {
    const evt = POCKET_HINTS[key]
    const now = performance.now()
    if (!hintAllowed(this.hintsAt, evt.code, now)) return
    this.hintsAt = { ...this.hintsAt, [evt.code]: now }
    this.board.emitHint(evt)
  }

  /** Таймеры зоны тикают, пока хоть одна рука чего-то ждёт: камера шлёт кадры, мышь — нет. */
  private ensureTicking(): void {
    if (this.frame) return
    const waiting = () =>
      [...this.hands.values()].some((h) => h.zone.phase !== 'idle' || h.zone.nearAt !== undefined || h.zone.stuckAt !== undefined)
    if (!waiting()) return
    const loop = () => {
      const t = performance.now()
      const fanTop = fanRegionTop(this.slots(), viewport())
      const next = new Map<HandId, HandInfo>()
      const events: ZoneEvent[] = []
      this.hands.forEach((h, hand) => {
        const r = stepZone(h.zone, { type: 'tick', t }, { fanTop })
        next.set(hand, { ...h, zone: r.zone })
        events.push(...r.events)
      })
      this.hands = next
      this.handleEvents(events)
      if (events.length) this.render()
      this.frame = waiting() ? requestAnimationFrame(loop) : 0
    }
    this.frame = requestAnimationFrame(loop)
  }

  private hotIndex(hand: HandId): number | undefined {
    const h = this.hands.get(hand)
    if (!h || h.zone.phase !== 'open') return undefined
    return pickCard(this.slots(), h.x, h.y, viewport())
  }

  private onGrab(e: GrabEvt): boolean {
    if (this.prep || this.board.getHeld()) return false
    const index = this.hotIndex(e.hand) ?? this.hotAt(e)
    const item = index === undefined ? undefined : visibleItems(this.state)[index]
    if (!item) return false
    const r = takeItem(this.state, item.id)
    if (!r) return false
    const element = this.board.addElement(r.spec, { hold: e.hand })
    this.closeHand(e.hand)
    this.commit(r.state, r.state !== this.state)
    this.events.emit('take', { item, element })
    return true
  }

  /** Grab мог прийти раньше cursor в той же точке: проверяем по координатам самого события. */
  private hotAt(e: GrabEvt): number | undefined {
    const h = this.hands.get(e.hand)
    if (!h || h.zone.phase !== 'open') return undefined
    return pickCard(this.slots(), e.x, e.y, viewport())
  }

  private closeHand(hand: HandId): void {
    const h = this.hands.get(hand)
    if (!h) return
    const wasOpen = this.isOpen()
    this.hands.set(hand, { ...h, zone: initialZone() })
    if (wasOpen && !this.isOpen()) this.events.emit('close', undefined)
  }

  private onRelease(e: ReleaseInfo): boolean {
    if (this.prep || !inPocket(e.y)) return false
    const item = stashElement(e.element, this.newId(), Date.now())
    this.applyHeldScale(1)
    this.board.removeElement(e.element.id, { animate: { x: e.x, y: 1 - POCKET_HEIGHT / 2 } })
    this.commit(addItem(this.state, item))
    this.view.gulp()
    this.events.emit('put', { item, element: e.element })
    return true
  }

  private applyHeldScale(scale: number): void {
    if (scale === this.heldScale) return
    this.heldScale = scale
    this.board.setHeldScale(scale)
  }

  private render(): void {
    const vp = viewport()
    const items = visibleItems(this.state)
    const hands = [...this.hands.entries()]
    const hot = new Set(hands.map(([hand]) => this.hotIndex(hand)).filter((i): i is number => i !== undefined))
    const carriers = hands.filter(([, h]) => h.carrying)
    this.view.render({
      items,
      slots: fanLayout(items.length, vp),
      viewport: vp,
      open: !this.prep && this.isOpen(),
      hot,
      armed: !this.prep && carriers.some(([, h]) => inPocket(h.y)),
      near: !this.prep && carriers.some(([, h]) => nearPocket(h.y)),
      dwell: !this.prep && hands.some(([, h]) => h.zone.phase === 'hover'),
      count: this.state.items.length,
      hidden: hiddenCounts(this.state),
      disabled: this.prep,
    })
  }

  private newId(): string {
    this.seq += 1
    return `pk-${Date.now().toString(36)}-${this.seq}`
  }
}
