import type { Board } from '../board'
import type {
  CursorEvt,
  HintEvt,
  InputEventMap,
  InputEventType,
  InputSource,
  SwipeDir,
  SwipeEvt,
  Unsubscribe,
} from '../contracts/input'
import { POCKET_HEIGHT } from '../pocket'
import { InputEmitter } from '../shared/emitter'
import { nearest, nextInDirection, stepPoint, type NavPoint, type NavTarget } from './focus-nav'
import type { WorldRect } from './zones'

/**
 * Управление без курсора. Прослойка между источником ввода и доской: сама ставит курсор в центр
 * элемента в фокусе, а взмахи переносят фокус к соседу. С кулаком взмах переносит элемент к следующей
 * зоне привязки. Взмах вниз с нижнего элемента уводит в карман, там взмахи листают карточки.
 * Доска и карман получают обычные события контракта и ничего не знают о фокусе.
 */

export interface FocusDeps {
  readonly board: Board
  /** Экранный слой, в котором карман рисует карточки. */
  readonly overlay: HTMLElement
  /** Рамки в мировых координатах, к которым прилипает переносимый элемент. */
  readonly snapRects: () => readonly WorldRect[]
}

/** Точка кармана на экране и граница, ниже которой перенос вниз уходит в карман. */
const POCKET_POINT: NavPoint = { x: 0.5, y: 1 - POCKET_HEIGHT / 2 }
const POCKET_ENTER_Y = 0.72
/** Фокус ближе этого к краю экрана — камера доски сдвигается к нему. */
const FOLLOW_MARGIN = 0.08
/** Куда встаёт фокус при выходе из кармана вверх. */
const FROM_POCKET: NavPoint = { x: 0.5, y: 0.75 }
/** Внутри рамки элемент кладётся в первую свободную из этих точек, доли рамки. */
const SLOT_POINTS: readonly NavPoint[] = [
  { x: 0.5, y: 0.5 },
  { x: 0.28, y: 0.3 },
  { x: 0.72, y: 0.3 },
  { x: 0.28, y: 0.7 },
  { x: 0.72, y: 0.7 },
]
/** Точка слота занята, если центр другого элемента ближе этого, доли экрана. */
const SLOT_BUSY = 0.05

export const FOCUS_HINTS = {
  EDGE: { code: 'NAV_EDGE', message: 'В эту сторону больше ничего нет, махни в другую', severity: 'info' },
  POCKET_EMPTY: { code: 'NAV_POCKET_EMPTY', message: 'Задержи руку, карман откроется, потом листай взмахами вбок', severity: 'info' },
} as const satisfies Record<string, HintEvt>

const PASS: readonly InputEventType[] = ['zoom', 'pan', 'handlost', 'hint']

export class FocusInput implements InputSource {
  private readonly em = new InputEmitter()
  private readonly offs: Unsubscribe[] = []
  private deps: FocusDeps | undefined
  private focusId: string | undefined
  private inPocket = false
  private cardId: string | undefined
  private holdPoint: NavPoint | undefined
  private point: NavPoint = { x: 0.5, y: 0.5 }
  private lastCursor: CursorEvt | undefined

  constructor(private readonly source: InputSource) {
    PASS.forEach((type) => this.offs.push(source.on(type, (e) => this.em.emit(type, e as never))))
    this.offs.push(
      source.on('cursor', (e) => this.onCursor(e)),
      source.on('grab', (e) => this.forwardAt('grab', e)),
      source.on('release', (e) => this.forwardAt('release', e)),
      source.on('throw', (e) => this.forwardAt('throw', e)),
      source.on('point', (e) => this.forwardAt('point', e)),
      source.on('swipe', (e) => this.onSwipe(e)),
    )
  }

  on: InputSource['on'] = (type, fn) => this.em.on(type, fn)

  async start(): Promise<void> {
    return this.source.start()
  }

  stop(): void {
    this.offs.splice(0).forEach((off) => off())
  }

  attach(deps: FocusDeps): void {
    this.deps = deps
  }

  private onCursor(e: CursorEvt): void {
    this.lastCursor = e
    this.sync()
    this.em.emit('cursor', { ...e, x: this.point.x, y: this.point.y })
  }

  private forwardAt<K extends 'grab' | 'release' | 'throw' | 'point'>(type: K, e: InputEventMap[K]): void {
    this.sync()
    this.em.emit(type, { ...e, x: this.point.x, y: this.point.y } as InputEventMap[K])
    const held = this.deps?.board.getHeld()
    if (type === 'grab' && held) {
      this.focusId = held.element.id
      this.holdPoint = { ...this.point }
      this.inPocket = false
      this.cardId = undefined
    }
    if (type === 'release' || type === 'throw') this.holdPoint = undefined
  }

  private onSwipe(e: SwipeEvt): void {
    if (!this.deps) return
    if (this.deps.board.getHeld()) this.moveHeld(e.dir)
    else if (this.inPocket) this.navigatePocket(e.dir)
    else this.navigateBoard(e.dir)
    this.em.emit('swipe', e)
    this.emitCursor()
  }

  private moveHeld(dir: SwipeDir): void {
    const from = this.holdPoint ?? this.point
    const snap = nextInDirection(from, dir, this.snapTargets())
    const next = snap ?? stepPoint(from, dir)
    const intoPocket = dir === 'down' && (!snap || next.y > POCKET_ENTER_Y) && from.y >= POCKET_ENTER_Y - 0.2
    this.holdPoint = intoPocket ? POCKET_POINT : { x: next.x, y: next.y }
  }

  private navigatePocket(dir: SwipeDir): void {
    if (dir === 'up') {
      this.inPocket = false
      this.cardId = undefined
      this.focusId = nearest(FROM_POCKET, this.elementTargets())?.id
      return
    }
    const cards = this.cardTargets()
    if (cards.length === 0) return this.hint(FOCUS_HINTS.POCKET_EMPTY)
    const cur = cards.find((c) => c.id === this.cardId)
    const next = cur ? nextInDirection(cur, dir, cards, cur.id) : nearest(this.point, cards)
    if (next) this.cardId = next.id
  }

  private navigateBoard(dir: SwipeDir): void {
    const targets = this.elementTargets()
    const cur = targets.find((t) => t.id === this.focusId)
    const next = nextInDirection(cur ?? this.point, dir, targets, this.focusId)
    if (next) {
      this.focusId = next.id
    } else if (dir === 'down') {
      this.inPocket = true
      this.cardId = undefined
    } else {
      this.hint(FOCUS_HINTS.EDGE)
    }
  }

  /** Пересчитывает точку курсора по текущему фокусу. */
  private sync(): void {
    const board = this.deps?.board
    if (!board) return
    const held = board.getHeld()
    if (held) {
      this.point = this.holdPoint ?? board.toScreen(held.element)
      return
    }
    if (this.inPocket) {
      this.point = this.cardTargets().find((c) => c.id === this.cardId) ?? POCKET_POINT
      return
    }
    const targets = this.elementTargets()
    const focus = targets.find((t) => t.id === this.focusId) ?? nearest(this.point, targets)
    this.focusId = focus?.id
    if (!focus) return
    this.point = { x: focus.x, y: focus.y }
    this.follow(focus)
  }

  /** Фокус у края экрана: камера доски переезжает к нему. */
  private follow(focus: NavTarget): void {
    const board = this.deps?.board
    const inside = (v: number): boolean => v > FOLLOW_MARGIN && v < 1 - FOLLOW_MARGIN
    if (!board || (inside(focus.x) && inside(focus.y))) return
    const el = board.getState().elements.find((e) => e.id === focus.id)
    if (el) board.setCamera({ ...board.getState().camera, x: el.x, y: el.y })
  }

  private emitCursor(): void {
    const c = this.lastCursor
    if (!c) return
    this.sync()
    this.em.emit('cursor', { ...c, x: this.point.x, y: this.point.y })
  }

  private hint(h: HintEvt): void {
    this.em.emit('hint', h)
  }

  private elementTargets(): NavTarget[] {
    const board = this.deps?.board
    if (!board) return []
    return board.getState().elements.map((el) => ({ id: el.id, ...board.toScreen(el) }))
  }

  private cardTargets(): NavTarget[] {
    const cards = this.deps?.overlay.querySelectorAll<HTMLElement>('.pk-card.is-shown') ?? []
    return Array.from(cards).map((card, i) => {
      const r = card.getBoundingClientRect()
      return { id: String(i), x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }
    })
  }

  /** По одной точке на рамку: первый свободный слот, чтобы элементы не ложились друг на друга. */
  private snapTargets(): NavTarget[] {
    const board = this.deps?.board
    if (!board || !this.deps) return []
    const heldId = board.getHeld()?.element.id
    const others = this.elementTargets().filter((t) => t.id !== heldId)
    return this.deps.snapRects().flatMap((r, i) => {
      const slots = SLOT_POINTS.map((s) =>
        board.toScreen({ x: r.left + (r.right - r.left) * s.x, y: r.top + (r.bottom - r.top) * s.y }),
      )
      const free = slots.find((p) => others.every((o) => Math.hypot(o.x - p.x, o.y - p.y) > SLOT_BUSY)) ?? slots[0]
      return free ? [{ id: `snap-${i}`, ...free }] : []
    })
  }
}
