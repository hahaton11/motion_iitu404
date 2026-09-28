import { createNode } from '../board/element-view'
import { createElement } from '../board/model'
import type { PocketItem } from './model'

/** Миниатюра занимает такую долю карточки. */
export const THUMB_FILL = 0.74

const SVG_NS = 'http://www.w3.org/2000/svg'
const LOCK_PATH = 'M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V7a3 3 0 0 0-6 0v3z'

function lockIcon(): HTMLElement {
  const badge = Object.assign(document.createElement('div'), { className: 'pk-lock', title: 'Заготовка: достаётся копия' })
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', LOCK_PATH)
  svg.append(path)
  badge.append(svg)
  return badge
}

/**
 * Миниатюра элемента в том же виде, что на доске: переиспользуется разметка и тема доски.
 * Масштаб задаётся через CSS-переменную --pk-card, чтобы карточку можно было ресайзить без пересборки.
 */
function thumb(item: PocketItem): HTMLElement {
  const el = createElement({ ...item.content, id: `pk-thumb-${item.id}`, x: 0, y: 0, rotation: 0 })
  const node = createNode({ ...el, x: el.w / 2, y: el.h / 2 })
  node.root.classList.add('pk-thumb-el')
  const wrap = Object.assign(document.createElement('div'), { className: 'pk-thumb' })
  wrap.style.width = `${el.w}px`
  wrap.style.height = `${el.h}px`
  wrap.style.setProperty('--pk-thumb-k', String(THUMB_FILL / Math.max(el.w, el.h)))
  wrap.append(node.root)
  return wrap
}

export function createCard(item: PocketItem): HTMLElement {
  const card = Object.assign(document.createElement('div'), { className: 'pk-card' })
  card.dataset.id = item.id
  card.dataset.type = item.type
  card.append(thumb(item))
  if (item.type === 'preset') card.append(lockIcon())
  return card
}
