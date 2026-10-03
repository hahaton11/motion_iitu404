import type { BoardElement } from './model'

const SVG_NS = 'http://www.w3.org/2000/svg'
const TRIANGLE_POINTS = '50,0 100,100 0,100'

/** DOM одного элемента: обёртка (позиция, поворот), тень, тело (подъём, наклон), контур. */
export interface ElementNode {
  readonly root: HTMLElement
  readonly shadow: HTMLElement
  readonly body: HTMLElement
  readonly outline: HTMLElement
  readonly text?: HTMLElement
  readonly img?: HTMLImageElement
  el: BoardElement
}

export const div = (className: string): HTMLElement => Object.assign(document.createElement('div'), { className })

function triangleSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'mb-tri')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('preserveAspectRatio', 'none')
  const poly = document.createElementNS(SVG_NS, 'polygon')
  poly.setAttribute('points', TRIANGLE_POINTS)
  svg.append(poly)
  return svg
}

/** Трансформ обёртки в мировых координатах: центр в (x, y). */
export const placeTransform = (x: number, y: number, el: BoardElement): string =>
  `translate3d(${x - el.w / 2}px, ${y - el.h / 2}px, 0) rotate(${el.rotation}deg)`

const hasText = (el: BoardElement): boolean => el.kind !== 'image' && (el.kind === 'sticky' || !!el.text)

function buildContent(el: BoardElement, body: HTMLElement, outline: HTMLElement): Pick<ElementNode, 'text' | 'img'> {
  if (el.kind === 'triangle') {
    body.append(triangleSvg())
    outline.append(triangleSvg())
  }
  if (el.kind === 'image') {
    const img = Object.assign(document.createElement('img'), { alt: '', draggable: false, decoding: 'async' })
    body.append(img)
    return { img }
  }
  const text = div('mb-text')
  body.append(text)
  return { text }
}

export function createNode(el: BoardElement): ElementNode {
  const root = div('mb-el')
  root.dataset.kind = el.kind
  root.dataset.id = el.id
  const shadow = div('mb-shadow')
  const body = div('mb-body')
  const outline = div('mb-outline')
  const content = buildContent(el, body, outline)
  root.append(shadow, body, outline)
  const node: ElementNode = { root, shadow, body, outline, ...content, el }
  applyAll(node, el)
  return node
}

function applyAll(node: ElementNode, el: BoardElement): void {
  const s = node.root.style
  s.width = `${el.w}px`
  s.height = `${el.h}px`
  s.zIndex = String(el.z)
  s.setProperty('--c', el.color)
  s.transform = placeTransform(el.x, el.y, el)
  if (node.text) node.text.textContent = hasText(el) ? (el.text ?? '') : ''
  if (node.img && el.src) node.img.src = el.src
}

/** Обновляет только изменившиеся свойства. pinned: позицию ведёт fx, трансформ не трогаем. */
export function updateNode(node: ElementNode, el: BoardElement, pinned: boolean): void {
  const prev = node.el
  if (prev === el) return
  const s = node.root.style
  if (prev.w !== el.w || prev.h !== el.h) {
    s.width = `${el.w}px`
    s.height = `${el.h}px`
  }
  if (prev.z !== el.z) s.zIndex = String(el.z)
  if (prev.color !== el.color) s.setProperty('--c', el.color)
  if (prev.text !== el.text && node.text) node.text.textContent = hasText(el) ? (el.text ?? '') : ''
  if (prev.src !== el.src && node.img && el.src) node.img.src = el.src
  const moved = prev.x !== el.x || prev.y !== el.y || prev.rotation !== el.rotation || prev.w !== el.w || prev.h !== el.h
  if (moved && !pinned) s.transform = placeTransform(el.x, el.y, el)
  node.el = el
}
