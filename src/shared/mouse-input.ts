import type { InputSource, SwipeDir } from '../contracts/input'
import { POINT_HOLD_MS, THROW_SPEED } from './constants'
import { InputEmitter } from './emitter'
import { VelocityTracker, speedOf } from './velocity'

/** Кнопки мыши, которые тянут доску: средняя и правая. Левая с зажатым пробелом — тоже. */
const PAN_BUTTONS: ReadonlySet<number> = new Set([1, 2])
const LEFT_BUTTON = 0

const ARROWS: Readonly<Record<string, SwipeDir>> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }

/**
 * Эмулятор жестов мышью с тем же контрактом, что у камеры.
 * ЛКМ = grab/release, резкий бросок = throw, колесо = zoom, Shift+ЛКМ удержание = point, стрелки = взмахи.
 * Перетаскивание средней или правой кнопкой, либо ЛКМ с зажатым пробелом = pan, как жест двух пальцев.
 * Рука всегда 'right'.
 */
export class MouseInput implements InputSource {
  private readonly em = new InputEmitter()
  private vel = VelocityTracker.empty()
  private holding = false
  /** Где была мышь на прошлом событии панорамы. undefined — панорамы нет. */
  private panFrom: { x: number; y: number } | undefined
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
    this.em.emit('swipe', { hand: 'right', dir, holding: this.holding })
  }

  stop(): void {
    this.disposers.splice(0).forEach((d) => d())
    clearTimeout(this.pointTimer)
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
    const from = this.panFrom
    if (from) {
      this.emitCursor(x, y)
      this.panFrom = { x, y }
      this.em.emit('pan', { hand: 'right', dx: x - from.x, dy: y - from.y })
      return
    }
    this.emitCursor(x, y)
  }

  private emitCursor(x: number, y: number): void {
    const panning = this.panFrom ? { panning: true } : {}
    this.em.emit('cursor', { hand: 'right', x, y, closure: this.holding ? 1 : 0, holding: this.holding, ...panning })
  }

  private onDown(e: PointerEvent): void {
    const { x, y } = this.norm(e)
    const panButton = PAN_BUTTONS.has(e.button) || (e.button === LEFT_BUTTON && this.space)
    if (panButton && !this.holding) {
      e.preventDefault()
      this.panFrom = { x, y }
      this.emitCursor(x, y)
      return
    }
    if (e.button !== LEFT_BUTTON) return
    if (e.shiftKey) {
      this.pointTimer = setTimeout(() => this.em.emit('point', { hand: 'right', x, y }), POINT_HOLD_MS)
      return
    }
    this.holding = true
    this.em.emit('grab', { hand: 'right', x, y })
  }

  private onUp(e: PointerEvent): void {
    clearTimeout(this.pointTimer)
    if (this.panFrom) {
      this.panFrom = undefined
      const { x, y } = this.norm(e)
      this.emitCursor(x, y)
      return
    }
    if (!this.holding) return
    this.holding = false
    const { x, y } = this.norm(e)
    const v = this.vel.velocity()
    const type = speedOf(v) > THROW_SPEED ? 'throw' : 'release'
    this.em.emit(type, { hand: 'right', x, y, ...v })
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    const { x, y } = this.norm(e)
    this.em.emit('zoom', { factor: Math.exp(-e.deltaY * 0.001), cx: x, cy: y })
  }
}
