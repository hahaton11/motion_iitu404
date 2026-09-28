import { createNode, placeTransform, updateNode, type ElementNode } from './element-view'
import { worldToScreen, type Viewport } from './geometry'
import type { BoardState, Camera } from './model'

/** Шаг сетки точек в мировых единицах при zoom 1 и допустимый видимый диапазон шага. */
export const GRID_STEP = 32
export const GRID_MIN_PX = 22
export const GRID_MAX_PX = 44

/** Видимый шаг сетки: при зуме удваивается или делится пополам, чтобы точки не слипались. */
export function gridStep(zoom: number): number {
  let step = GRID_STEP * zoom
  while (step < GRID_MIN_PX) step *= 2
  while (step >= GRID_MAX_PX) step /= 2
  return step
}

const mod = (a: number, n: number): number => ((a % n) + n) % n

/**
 * DOM-рендер доски. Диффинг по id и по ссылке на объект элемента: неизменённые элементы не трогаются.
 * Камера — один transform на слое мира, сетка — transform на слое точек.
 */
export class BoardRenderer {
  readonly root: HTMLElement
  readonly world: HTMLElement
  readonly overlay: HTMLElement
  private readonly grid: HTMLElement
  private readonly nodes = new Map<string, ElementNode>()
  private readonly pinned = new Set<string>()
  private camera?: Camera
  private viewport: Viewport = { w: 0, h: 0 }
  private hovered = new Set<string>()
  private selectedId?: string

  constructor(host: HTMLElement) {
    this.root = Object.assign(document.createElement('div'), { className: 'mb-board' })
    this.grid = Object.assign(document.createElement('div'), { className: 'mb-grid' })
    this.world = Object.assign(document.createElement('div'), { className: 'mb-world' })
    this.overlay = Object.assign(document.createElement('div'), { className: 'mb-overlay' })
    this.root.append(this.grid, this.world, this.overlay)
    host.append(this.root)
  }

  node(id: string): ElementNode | undefined {
    return this.nodes.get(id)
  }

  render(state: BoardState, vp: Viewport): void {
    const viewportChanged = vp.w !== this.viewport.w || vp.h !== this.viewport.h
    this.viewport = vp
    if (viewportChanged || state.camera !== this.camera) this.renderCamera(state.camera, vp, viewportChanged)
    this.renderElements(state)
    this.renderSelection(state.selectedId)
  }

  /** Позиция элемента задаётся снаружи (удержание, оседание), рендер её не перезаписывает. */
  pin(id: string): void {
    this.pinned.add(id)
  }

  unpin(id: string): void {
    this.pinned.delete(id)
    const n = this.nodes.get(id)
    if (n) n.root.style.transform = placeTransform(n.el.x, n.el.y, n.el)
  }

  /** Забирает узел из рендера: он остаётся в DOM, пока fx доигрывает анимацию ухода. */
  detach(id: string): ElementNode | undefined {
    const n = this.nodes.get(id)
    this.nodes.delete(id)
    this.pinned.delete(id)
    this.hovered.delete(id)
    n?.root.classList.remove('is-hover', 'is-selected')
    return n
  }

  setHover(ids: ReadonlySet<string>): void {
    this.hovered.forEach((id) => ids.has(id) || this.nodes.get(id)?.root.classList.remove('is-hover'))
    ids.forEach((id) => this.hovered.has(id) || this.nodes.get(id)?.root.classList.add('is-hover'))
    this.hovered = new Set(ids)
  }

  destroy(): void {
    this.root.remove()
    this.nodes.clear()
  }

  private renderCamera(cam: Camera, vp: Viewport, resized: boolean): void {
    this.camera = cam
    const tx = vp.w / 2 - cam.x * cam.zoom
    const ty = vp.h / 2 - cam.y * cam.zoom
    this.world.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${cam.zoom})`
    const step = gridStep(cam.zoom)
    const scale = step / GRID_STEP
    const origin = worldToScreen(cam, vp, { x: 0, y: 0 })
    const ox = mod(origin.x, step) - step
    const oy = mod(origin.y, step) - step
    if (resized || this.grid.style.width === '') {
      const minScale = GRID_MIN_PX / GRID_STEP
      this.grid.style.width = `${(vp.w + 2 * GRID_MAX_PX) / minScale}px`
      this.grid.style.height = `${(vp.h + 2 * GRID_MAX_PX) / minScale}px`
    }
    this.grid.style.transform = `translate3d(${ox}px, ${oy}px, 0) scale(${scale})`
  }

  private renderElements(state: BoardState): void {
    const seen = new Set<string>()
    for (const el of state.elements) {
      seen.add(el.id)
      const n = this.nodes.get(el.id)
      if (n) {
        updateNode(n, el, this.pinned.has(el.id))
        continue
      }
      const created = createNode(el)
      this.nodes.set(el.id, created)
      this.world.append(created.root)
    }
    this.nodes.forEach((n, id) => {
      if (seen.has(id)) return
      n.root.remove()
      this.nodes.delete(id)
      this.pinned.delete(id)
    })
  }

  private renderSelection(id: string | undefined): void {
    if (id === this.selectedId) return
    if (this.selectedId) this.nodes.get(this.selectedId)?.root.classList.remove('is-selected')
    if (id) this.nodes.get(id)?.root.classList.add('is-selected')
    this.selectedId = id
  }
}
