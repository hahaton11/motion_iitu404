import { createNode, div, placeTransform, updateNode, type ElementNode } from './element-view'
import type { Viewport } from './geometry'
import type { BoardState, Camera } from './model'

/**
 * Насколько слои фона отстают от камеры. Глубину теперь держит сама плоскость доски,
 * а эти два слоя дают ей даль: свет на горизонте отстаёт заметно, дымка почти стоит.
 * Отдельный декоративный пол убран — он спорил с настоящей наклонённой плоскостью
 * и давал видимый шов поперёк экрана.
 */
export const PARALLAX = { horizon: 0.12, haze: 0.04 } as const

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

/**
 * Во сколько экранов делается сетка внутри плоскости доски. Наклонённая плоскость уходит
 * к горизонту, и её видно дальше, чем при плоской проекции: трёх экранов хватает,
 * а больше — лишние пиксели на растеризацию.
 */
export const GRID_COVER = 3

const mod = (a: number, n: number): number => ((a % n) + n) % n

/**
 * DOM-рендер доски. Диффинг по id и по ссылке на объект элемента: неизменённые элементы не трогаются.
 * Камера — один transform на слое мира, сетка — transform на слое точек.
 */
export class BoardRenderer {
  readonly root: HTMLElement
  readonly world: HTMLElement
  readonly overlay: HTMLElement
  private readonly depth: HTMLElement
  private readonly grid: HTMLElement
  private readonly nodes = new Map<string, ElementNode>()
  private readonly pinned = new Set<string>()
  private camera?: Camera
  private gridSize = 0
  private viewport: Viewport = { w: 0, h: 0 }
  private hovered = new Set<string>()
  private selectedId?: string

  constructor(host: HTMLElement) {
    this.root = Object.assign(document.createElement('div'), { className: 'mb-board' })
    this.depth = Object.assign(document.createElement('div'), { className: 'mb-depth' })
    this.depth.append(div('mb-horizon'), div('mb-haze'))
    this.grid = Object.assign(document.createElement('div'), { className: 'mb-grid' })
    this.world = Object.assign(document.createElement('div'), { className: 'mb-world' })
    this.overlay = Object.assign(document.createElement('div'), { className: 'mb-overlay' })
    // Сетка — ребёнок слоя мира: так наклон и масштаб достаются ей от доски, а не считаются заново.
    this.world.append(this.grid)
    this.root.append(this.depth, this.world, this.overlay)
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

  /**
   * Камера одним трансформом слоя мира. Порядок множителей повторяет то, что считает
   * `worldToScreen`: сдвиг на камеру, масштаб, наклон, перенос в центр экрана. Перспектива
   * задана родителю в CSS тем же `BOARD_PERSPECTIVE`, поэтому браузер рисует ровно ту
   * проекцию, по которой прицел ищет элементы.
   */
  private renderCamera(cam: Camera, vp: Viewport, resized: boolean): void {
    this.camera = cam
    const tilt = cam.tilt ?? 0
    const place = `translate3d(${vp.w / 2}px, ${vp.h / 2}px, 0)`
    const move = `scale(${cam.zoom}) translate3d(${-cam.x}px, ${-cam.y}px, 0)`
    this.world.style.transform = tilt === 0 ? `${place} ${move}` : `${place} rotateX(${tilt}deg) ${move}`
    this.renderGrid(cam, vp, resized)
    this.renderDepth(cam)
  }

  /**
   * Сетка лежит внутри плоскости доски, а не на экране: наклон и масштаб ей достаются
   * от слоя мира даром. Шаг в мировых единицах подбирается так, чтобы на экране точки
   * не слипались, — та же логика, что была в экранной сетке.
   */
  private renderGrid(cam: Camera, vp: Viewport, resized: boolean): void {
    const stepWorld = gridStep(cam.zoom) / cam.zoom
    const size = (Math.max(vp.w, vp.h) * GRID_COVER) / cam.zoom
    if (resized || this.grid.style.width === '' || this.gridSize !== size) {
      this.gridSize = size
      this.grid.style.width = `${size}px`
      this.grid.style.height = `${size}px`
    }
    this.grid.style.backgroundSize = `${stepWorld}px ${stepWorld}px`
    // Начало сетки прижато к шагу, иначе точки ползут относительно мира при панораме.
    const left = cam.x - size / 2
    const top = cam.y - size / 2
    this.grid.style.transform = `translate3d(${left - mod(left, stepWorld)}px, ${top - mod(top, stepWorld)}px, 0)`
  }

  /**
   * Параллакс слоёв глубины. Пишутся только две переменные на слой, вся геометрия пола —
   * статический CSS: перспектива на отдельном слое не трогает отображение мира в экран,
   * поэтому попадание по элементам считается тем же screenToWorld, что и до объёма.
   */
  private renderDepth(cam: Camera): void {
    const s = this.depth.style
    s.setProperty('--px', `${-cam.x * cam.zoom}px`)
    s.setProperty('--py', `${-cam.y * cam.zoom}px`)
    s.setProperty('--depth-zoom', String(cam.zoom))
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
