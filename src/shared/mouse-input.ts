import type { InputSource, SwipeDir } from '../contracts/input'
import { POINT_HOLD_MS, THROW_SPEED } from './constants'
import { InputEmitter } from './emitter'
import { VelocityTracker, speedOf } from './velocity'

const ARROWS: Readonly<Record<string, SwipeDir>> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }

/**
 * Эмулятор жестов мышью с тем же контрактом, что у камеры.
 * ЛКМ = grab/release, резкий бросок = throw, колесо = zoom, Shift+ЛКМ удержание = point, стрелки = взмахи.
 * Рука всегда 'right'.
 */
export class MouseInput implements InputSource {
  private readonly em = new InputEmitter()
  private vel = VelocityTracker.empty()
  private holding = false
  private pointTimer: ReturnType<typeof setTimeout> | undefined
  private readonly disposers: Array<() => void> = []

  constructor(private readonly target: HTMLElement | Window = window) {}

  on: InputSource['on'] = (type, fn) => this.em.on(type, fn)

  async start(): Promise<void> {
    this.listen('pointermove', (e) => this.onMove(e as PointerEvent))
    this.listen('pointerdown', (e) => this.onDown(e as PointerEvent))
    this.listen('pointerup', (e) => this.onUp(e as PointerEvent))
    this.listen('wheel', (e) => this.onWheel(e as WheelEvent), { passive: false })
    this.listen('pointerleave', () => this.em.emit('handlost', { hand: 'right' }))
    const onKey = (e: KeyboardEvent): void => this.onKey(e)
    window.addEventListener('keydown', onKey)
    this.disposers.push(() => window.removeEventListener('keydown', onKey))
  }

  private onKey(e: KeyboardEvent): void {
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
    this.em.emit('cursor', { hand: 'right', x, y, closure: this.holding ? 1 : 0, holding: this.holding })
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0) return
    const { x, y } = this.norm(e)
    if (e.shiftKey) {
      this.pointTimer = setTimeout(() => this.em.emit('point', { hand: 'right', x, y }), POINT_HOLD_MS)
      return
    }
    this.holding = true
    this.em.emit('grab', { hand: 'right', x, y })
  }

  private onUp(e: PointerEvent): void {
    clearTimeout(this.pointTimer)
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
