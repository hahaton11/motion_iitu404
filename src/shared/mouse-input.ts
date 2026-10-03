import type { HandId, InputSource, SwipeDir } from '../contracts/input'
import { MOUSE_PINCH_TILT_GAIN_DEG, MOUSE_PINCH_ZOOM_GAIN, POINT_HOLD_MS, PUT_WINDOW_MS, THROW_MEMORY_MS, THROW_SPEED } from './constants'
import { InputEmitter } from './emitter'
import { VelocityTracker, speedOf } from './velocity'

/** Кнопки мыши, которые тянут доску: средняя и правая. Левая с зажатым пробелом — тоже. */
const PAN_BUTTONS: ReadonlySet<number> = new Set([1, 2])
const LEFT_BUTTON = 0

const ARROWS: Readonly<Record<string, SwipeDir>> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }

/**
 * Эмулятор жестов мышью с тем же контрактом, что у камеры.
 * Клик ЛКМ по элементу = взять: кнопка нажата — кулак, отпущена — ладонь, а элемент прилип и едет
 * за мышью без зажатой кнопки. Второй клик = щелчок кулак → ладонь: на месте кладёт, на быстром ходу
 * выбрасывает (throw), клик дольше PUT_WINDOW_MS только кладёт. Кнопка на пустом месте — кулак
 * без элемента, отпускание его раскрывает, как у камеры.
 * Колесо = zoom, Shift+ЛКМ удержание = point, стрелки = взмахи.
 * Перетаскивание средней или правой кнопкой, либо ЛКМ с зажатым пробелом = pan, как жест двух пальцев.
 * Alt + перетаскивание ЛКМ вверх или вниз = zoom, как щипок: курсор стоит в точке нажатия, вокруг неё
 * масштабируется доска, вверх — ближе, вниз — дальше. Рука всегда 'right'.
 */
export class MouseInput implements InputSource {
  private readonly em = new InputEmitter()
  private vel = VelocityTracker.empty()
  /** Когда мышь двигалась в последний раз: скорость старше THROW_MEMORY_MS не считается махом. */
  private movedAt = -Infinity
  /** Кнопка зажата после захвата: кулак. */
  private holding = false
  /** Доска держит элемент в руке: захват прилип. */
  private carrying = false
  /** Когда нажата кнопка второго клика, который положит или выбросит несомый элемент. */
  private clickAt: number | undefined
  /** Где была мышь на прошлом событии панорамы. undefined — панорамы нет. */
  private panFrom: { x: number; y: number } | undefined
  /** Зум щипком: центр масштаба, x и y мыши на прошлом событии. undefined — зума нет. */
  private pinch: { cx: number; cy: number; x: number; y: number } | undefined
  private space = false
  private pointTimer: ReturnType<typeof setTimeout> | undefined
  private readonly disposers: Array<() => void> = []

  constructor(private readonly target: HTMLElement | Window = window) {}

  on: InputSource['on'] = (type, fn) => this.em.on(type, fn)

  async start(): Promise<void> {
    this.listen('pointermove', (e) => this.onMove(e as PointerEvent))
    this.listen('pointerdown', (e) => this.onDown(e as PointerEvent))
    this.listen('pointerup', (e) => this.onUp(e as PointerEvent))
    this.listen('wheel', (e) => this.onWheel(e as WheelEvent), { passive: false })
    this.listen('pointerleave', () => {
      this.panFrom = undefined
      this.pinch = undefined
      this.holding = false
      this.clickAt = undefined
      this.em.emit('handlost', { hand: 'right' })
    })
    this.listen('contextmenu', (e) => e.preventDefault())
    const onKey = (e: KeyboardEvent): void => this.onKey(e)
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space') this.space = false
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    this.disposers.push(() => window.removeEventListener('keydown', onKey), () => window.removeEventListener('keyup', onKeyUp))
  }

  private onKey(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      this.space = true
      // Прокрутка страницы пробелом мешает перетаскиванию, но кнопки в фокусе пробел нажимает как обычно.
      if (e.target === document.body) e.preventDefault()
      return
    }
    const dir = ARROWS[e.key]
    if (!dir || e.repeat) return
    e.preventDefault()
    this.em.emit('swipe', { hand: 'right', dir, holding: this.busy })
  }

  stop(): void {
    this.disposers.splice(0).forEach((d) => d())
    clearTimeout(this.pointTimer)
  }

  /** Доска взяла элемент в руку или забрала его без жеста, например в карман. */
  setCarrying(_hand: HandId, carrying: boolean): void {
    this.carrying = carrying
    if (carrying) return
    this.holding = false
    this.clickAt = undefined
  }

  /** Рука что-то держит: кулак после захвата или прилипший элемент. */
  private get busy(): boolean {
    return this.holding || this.carrying
  }

  private listen(type: string, fn: EventListener, opts?: AddEventListenerOptions): void {
    this.target.addEventListener(type, fn, opts)
    this.disposers.push(() => this.target.removeEventListener(type, fn, opts))
  }

  private norm(e: MouseEvent): { x: number; y: number } {
    return { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight }
  }

  private onMove(e: PointerEvent): void {
    const { x, y } = this.norm(e)
    this.vel = this.vel.push(x, y, e.timeStamp)
    this.movedAt = e.timeStamp
    // Отпускание кнопки может не дойти: окно теряет фокус посреди перетаскивания, браузер
    // съедает событие, система забирает жест себе. Для панорамы и зума это тупик — курсор
    // остаётся стоять на месте, и всё остальное перестаёт работать. Кнопка в движении
    // не нажата — жест закончился, чем бы ни было потеряно отпускание.
    if ((this.pinch || this.panFrom) && e.buttons === 0) this.endDrag(x, y)
    if (this.pinch) {
      this.movePinch(x, y)
      return
    }
    const from = this.panFrom
    if (from) {
      this.emitCursor(x, y)
      this.panFrom = { x, y }
      this.em.emit('pan', { hand: 'right', dx: x - from.x, dy: y - from.y })
      return
    }
    this.emitCursor(x, y)
  }

  /**
   * Курсор стоит в центре масштаба. Вертикальный ход мыши масштабирует доску, горизонтальный
   * кренит её плоскость — те же две оси, что у щипка живой рукой.
   */
  private movePinch(x: number, y: number): void {
    const pinch = this.pinch
    if (!pinch) return
    this.emitCursor(pinch.cx, pinch.cy)
    this.pinch = { ...pinch, x, y }
    if (y !== pinch.y) this.em.emit('zoom', { factor: Math.exp(-(y - pinch.y) * MOUSE_PINCH_ZOOM_GAIN), cx: pinch.cx, cy: pinch.cy })
    if (x !== pinch.x) this.em.emit('tilt', { hand: 'right', delta: (x - pinch.x) * MOUSE_PINCH_TILT_GAIN_DEG })
  }

  private emitCursor(x: number, y: number): void {
    const panning = this.panFrom ? { panning: true } : {}
    const zooming = this.pinch ? { zooming: true } : {}
    const fist = this.holding || this.clickAt !== undefined
    this.em.emit('cursor', { hand: 'right', x, y, closure: fist ? 1 : 0, holding: this.busy, ...panning, ...zooming })
  }

  private onDown(e: PointerEvent): void {
    const { x, y } = this.norm(e)
    const panButton = PAN_BUTTONS.has(e.button) || (e.button === LEFT_BUTTON && this.space)
    if (panButton && !this.busy) {
      e.preventDefault()
      this.panFrom = { x, y }
      this.emitCursor(x, y)
      return
    }
    if (e.button !== LEFT_BUTTON) return
    if (e.altKey && !this.busy) {
      e.preventDefault()
      this.pinch = { cx: x, cy: y, x, y }
      this.emitCursor(x, y)
      return
    }
    if (e.shiftKey) {
      this.pointTimer = setTimeout(() => this.em.emit('point', { hand: 'right', x, y }), POINT_HOLD_MS)
      return
    }
    if (this.carrying) {
      this.clickAt = e.timeStamp
      this.emitCursor(x, y)
      return
    }
    this.holding = true
    this.em.emit('grab', { hand: 'right', x, y })
  }

  /** Панорама или зум закончились: курсор снова ходит за рукой с той точки, где она сейчас. */
  private endDrag(x: number, y: number): void {
    this.pinch = undefined
    this.panFrom = undefined
    this.emitCursor(x, y)
  }

  private onUp(e: PointerEvent): void {
    clearTimeout(this.pointTimer)
    if (this.pinch || this.panFrom) {
      const { x, y } = this.norm(e)
      return this.endDrag(x, y)
    }
    const { x, y } = this.norm(e)
    const clickAt = this.clickAt
    this.clickAt = undefined
    if (clickAt !== undefined) return this.drop(x, y, e.timeStamp - clickAt <= PUT_WINDOW_MS && this.flying(e.timeStamp))
    if (!this.holding) return
    this.holding = false
    // Кнопка отпущена после захвата элемента: рука раскрылась, элемент прилип и едет дальше.
    if (this.carrying) return this.emitCursor(x, y)
    this.drop(x, y, this.flying(e.timeStamp))
  }

  /** Мышь только что летела быстрее порога броска. */
  private flying(t: number): boolean {
    return t - this.movedAt <= THROW_MEMORY_MS && speedOf(this.vel.velocity()) > THROW_SPEED
  }

  private drop(x: number, y: number, thrown: boolean): void {
    this.carrying = false
    this.em.emit(thrown ? 'throw' : 'release', { hand: 'right', x, y, ...this.vel.velocity() })
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    const { x, y } = this.norm(e)
    this.em.emit('zoom', { factor: Math.exp(-e.deltaY * 0.001), cx: x, cy: y })
  }
}
