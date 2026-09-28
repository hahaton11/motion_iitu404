import { placeTransform, type ElementNode } from './element-view'
import { screenToWorld, worldToScreen, type Point, type Viewport } from './geometry'
import type { BoardElement, Camera } from './model'
import { SETTLE_EPS_PX, followStep, smoothing, throwPath, tiltStep } from './physics'
import type { BoardRenderer } from './render'

export const LIFT_SCALE = 1.06
export const LIFT_MS = 140
export const DROP_MS = 220
export const DROP_SQUASH = 0.97
/** Во время падения элемент догоняет точку отпускания быстрее, чем при удержании. */
export const SETTLE_TAU_MS = 28
export const HELD_SCALE_TAU_MS = 70
export const APPEAR_MS = 280
export const VANISH_MS = 200
export const POCKET_FLY_MS = 320
export const POCKET_FLY_SCALE = 0.15
/** Предел dt кадра: после простоя вкладки анимация не прыгает. */
export const MAX_FRAME_MS = 50

const DROP_EASING = 'cubic-bezier(0.3, 0.7, 0.4, 1)'
const THROW_EASING = 'cubic-bezier(0.2, 0.6, 0.35, 1)'
const APPEAR_EASING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

interface Follow {
  readonly id: string
  pos: Point
  tilt: number
  scale: number
  mode: 'hold' | 'settle'
  readonly liftAt: number
  dropEndsAt: number
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3

/**
 * Анимации доски. Удерживаемый элемент ведётся по кадрам: инерционное следование, наклон по скорости,
 * подъём. Остальное — Web Animations API по transform и opacity.
 */
export class BoardFx {
  private readonly follows = new Map<string, Follow>()
  private heldScale = 1
  private last = 0

  constructor(
    private readonly renderer: BoardRenderer,
    private readonly view: () => { readonly camera: Camera; readonly viewport: Viewport },
  ) {}

  /** Внешний множитель масштаба удерживаемого элемента, например над карманом. */
  setHeldScale(scale: number): void {
    this.heldScale = scale
  }

  get active(): boolean {
    return this.follows.size > 0
  }

  lift(id: string, now: number): void {
    const node = this.renderer.node(id)
    if (!node) return
    const prev = this.follows.get(id)
    this.renderer.pin(id)
    node.root.classList.add('is-lifted')
    node.body.getAnimations().forEach((a) => a.cancel())
    const pos = prev?.pos ?? { x: node.el.x, y: node.el.y }
    this.follows.set(id, { id, pos, tilt: prev?.tilt ?? 0, scale: prev?.scale ?? 1, mode: 'hold', liftAt: now, dropEndsAt: 0 })
  }

  drop(id: string, now: number): void {
    const f = this.follows.get(id)
    const node = this.renderer.node(id)
    if (!f || !node) return
    f.mode = 'settle'
    f.dropEndsAt = now + DROP_MS
    node.root.classList.remove('is-lifted')
    const from = node.body.style.transform || 'none'
    node.body.style.transform = ''
    node.body.animate(
      [
        { transform: from },
        { transform: `scale(${DROP_SQUASH}) rotate(0deg)`, offset: 0.6 },
        { transform: 'scale(1) rotate(0deg)' },
      ],
      { duration: DROP_MS, easing: DROP_EASING },
    )
  }

  /** Бросок: узел уходит из рендера и летит по вектору скорости за край экрана. */
  throwAway(element: BoardElement, vx: number, vy: number): void {
    const node = this.takeNode(element.id)
    if (!node) return
    const { camera, viewport } = this.view()
    const pos = { x: node.el.x, y: node.el.y }
    const start = this.follows.get(element.id)?.pos ?? pos
    this.follows.delete(element.id)
    const path = throwPath(worldToScreen(camera, viewport, start), vx, vy, viewport)
    const place = placeTransform(start.x, start.y, node.el)
    const dx = path.dx / camera.zoom
    const dy = path.dy / camera.zoom
    node.root.style.zIndex = '100000'
    node.root.animate(
      [
        { transform: `translate3d(0px, 0px, 0) ${place} rotate(0deg)`, opacity: 1 },
        { opacity: 0.85, offset: 0.55 },
        { transform: `translate3d(${dx}px, ${dy}px, 0) ${place} rotate(${path.spinDeg}deg)`, opacity: 0 },
      ],
      { duration: path.durationMs, easing: THROW_EASING, fill: 'forwards' },
    ).onfinish = () => node.root.remove()
  }

  /** Удаление с плашки: элемент сжимается и растворяется на месте. */
  vanish(element: BoardElement): void {
    const node = this.takeNode(element.id)
    if (!node) return
    node.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: VANISH_MS, fill: 'forwards' })
    node.body
      .animate([{ transform: 'scale(1)' }, { transform: 'scale(0.6)' }], { duration: VANISH_MS, easing: 'ease-in', fill: 'forwards' })
      .onfinish = () => node.root.remove()
  }

  /** Элемент улетает в точку экрана (карман) и растворяется. */
  flyTo(element: BoardElement, target: Point): void {
    const node = this.takeNode(element.id)
    if (!node) return
    const { camera, viewport } = this.view()
    const start = this.follows.get(element.id)?.pos ?? { x: node.el.x, y: node.el.y }
    this.follows.delete(element.id)
    const end = screenToWorld(camera, viewport, target)
    const place = placeTransform(start.x, start.y, node.el)
    node.root.classList.remove('is-lifted')
    node.root.animate(
      [
        { transform: `translate3d(0px, 0px, 0) ${place} scale(1)`, opacity: 1 },
        { transform: `translate3d(${end.x - start.x}px, ${end.y - start.y}px, 0) ${place} scale(${POCKET_FLY_SCALE})`, opacity: 0 },
      ],
      { duration: POCKET_FLY_MS, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
    ).onfinish = () => node.root.remove()
  }

  appear(id: string): void {
    this.renderer.node(id)?.body.animate(
      [
        { transform: 'scale(0.6)', opacity: 0 },
        { transform: 'scale(1.04)', opacity: 1, offset: 0.7 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: APPEAR_MS, easing: APPEAR_EASING },
    )
  }

  /** Кадр анимации удерживаемых и оседающих элементов. */
  tick(now: number): void {
    const dt = Math.min(MAX_FRAME_MS, this.last ? now - this.last : 16)
    this.last = now
    if (dt <= 0) return
    const { camera } = this.view()
    this.follows.forEach((f) => this.stepFollow(f, now, dt, camera))
  }

  /** Сбрасывает счётчик кадров, когда цикл простаивал. */
  resetClock(): void {
    this.last = 0
  }

  private stepFollow(f: Follow, now: number, dt: number, camera: Camera): void {
    const node = this.renderer.node(f.id)
    if (!node) {
      this.follows.delete(f.id)
      return
    }
    const el = node.el
    const prev = f.pos
    f.pos = followStep(prev, el, dt, f.mode === 'hold' ? undefined : SETTLE_TAU_MS)
    node.root.style.transform = placeTransform(f.pos.x, f.pos.y, el)
    if (f.mode === 'hold') {
      const vx = ((f.pos.x - prev.x) * camera.zoom * 1000) / dt
      f.tilt = tiltStep(f.tilt, vx, dt)
      f.scale += (this.heldScale - f.scale) * smoothing(dt, HELD_SCALE_TAU_MS)
      const lift = 1 + (LIFT_SCALE - 1) * easeOut(Math.min(1, (now - f.liftAt) / LIFT_MS))
      node.body.style.transform = `scale(${lift * f.scale}) rotate(${f.tilt}deg)`
      return
    }
    const gap = Math.hypot(el.x - f.pos.x, el.y - f.pos.y) * camera.zoom
    if (gap < SETTLE_EPS_PX && now >= f.dropEndsAt) this.finish(f.id)
  }

  private finish(id: string): void {
    this.follows.delete(id)
    this.renderer.unpin(id)
  }

  private takeNode(id: string): ElementNode | undefined {
    const node = this.renderer.detach(id)
    node?.root.getAnimations().forEach((a) => a.cancel())
    return node
  }
}
