import type { HandId } from '../contracts/input'
import { BOARD_TILT_DEG } from './geometry'

export type ElementKind = 'sticky' | 'rect' | 'square' | 'circle' | 'triangle' | 'image'

export const ELEMENT_KINDS: readonly ElementKind[] = ['sticky', 'rect', 'square', 'circle', 'triangle', 'image']

/** Элемент доски. x, y — центр в мировых координатах, rotation в градусах. */
export interface BoardElement {
  readonly id: string
  readonly kind: ElementKind
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly rotation: number
  readonly color: string
  readonly text?: string
  /** Для image: dataURL или blob URL. */
  readonly src?: string
  readonly z: number
}

/**
 * Камера: x, y — мировая точка в центре экрана. tilt — наклон плоскости доски в градусах,
 * ноль или отсутствие даёт прежнюю плоскую проекцию.
 */
export interface Camera {
  readonly x: number
  readonly y: number
  readonly zoom: number
  readonly tilt?: number
}

/** dx, dy — смещение центра элемента от точки захвата в мировых координатах. */
export interface Held {
  readonly hand: HandId
  readonly id: string
  readonly dx: number
  readonly dy: number
}

export interface BoardState {
  readonly elements: readonly BoardElement[]
  readonly camera: Camera
  readonly held?: Held
  readonly selectedId?: string
}

export type ElementPatch = Partial<Omit<BoardElement, 'id'>>

/** Всё, кроме id, kind и позиции, необязательно: недостающее берётся из умолчаний. */
export type ElementSpec = Pick<BoardElement, 'id' | 'kind' | 'x' | 'y'> & ElementPatch

export const DEFAULT_SIZE: Readonly<Record<ElementKind, { readonly w: number; readonly h: number }>> = {
  sticky: { w: 180, h: 180 },
  rect: { w: 240, h: 150 },
  square: { w: 160, h: 160 },
  circle: { w: 160, h: 160 },
  triangle: { w: 180, h: 160 },
  image: { w: 240, h: 180 },
}

export const PALETTE: Readonly<Record<ElementKind, readonly string[]>> = {
  sticky: ['#ffe27a', '#ff9fb2', '#9ff0c6', '#9fd8ff', '#c9b6ff'],
  rect: ['#5ad1ff', '#7c8cff', '#3fe0b0', '#ff8a7a', '#e6edf7'],
  square: ['#7c8cff', '#5ad1ff', '#3fe0b0', '#ffb45a', '#e6edf7'],
  circle: ['#3fe0b0', '#5ad1ff', '#7c8cff', '#ff8a7a', '#ffe27a'],
  triangle: ['#ffb45a', '#ff8a7a', '#5ad1ff', '#3fe0b0', '#c9b6ff'],
  image: ['#1a2233'],
}

export function createElement(spec: ElementSpec): BoardElement {
  const size = DEFAULT_SIZE[spec.kind]
  const w = spec.w ?? size.w
  const h = spec.h ?? (spec.kind === 'square' && spec.w !== undefined ? spec.w : size.h)
  const base: BoardElement = {
    ...spec,
    w,
    h,
    rotation: spec.rotation ?? 0,
    color: spec.color ?? PALETTE[spec.kind][0] ?? '#ffffff',
    z: spec.z ?? 0,
  }
  return spec.kind === 'sticky' ? { ...base, text: spec.text ?? '' } : base
}

export function nextColor(kind: ElementKind, current: string): string {
  const list = PALETTE[kind]
  const i = list.indexOf(current)
  return list[(i + 1) % list.length] ?? current
}

export const emptyState = (): BoardState => ({ elements: [], camera: { x: 0, y: 0, zoom: 1, tilt: BOARD_TILT_DEG } })
