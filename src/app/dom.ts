import type { GestureIcon } from './tutorial'

/** Мелкие помощники DOM для экранов. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  node.append(...kids)
  return node
}

export const text = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value: string) => {
  const node = el(tag, className)
  node.textContent = value
  return node
}

/** Нажатия по UI приложения не должны доходить до эмулятора жестов мышью на window. */
export function isolate(node: HTMLElement): HTMLElement {
  ;['pointerdown', 'pointerup', 'wheel'].forEach((type) => node.addEventListener(type, (e) => e.stopPropagation()))
  return node
}

const SVG_NS = 'http://www.w3.org/2000/svg'

export type UiIcon = GestureIcon | 'sound'

/** Контурные иконки жестов, 24×24, цвет из currentColor. */
const ICON_PATHS: Readonly<Record<UiIcon, string>> = {
  sound: 'M4 9h4l5-4v14l-5-4H4zm12.5-.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  palm: 'M7 11V5.5a1.5 1.5 0 0 1 3 0V10m0-5.5V3.5a1.5 1.5 0 0 1 3 0V10m0-5a1.5 1.5 0 0 1 3 0v5m0-3a1.5 1.5 0 0 1 3 0v6.5A7.5 7.5 0 0 1 11.5 21 6.5 6.5 0 0 1 5.6 17.2L3.8 13a1.6 1.6 0 0 1 2.7-1.6L7 12',
  fist: 'M6 10a2 2 0 0 1 2-2h8.5A2.5 2.5 0 0 1 19 10.5V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6zm0 1h13M9 8v3m3.5-3v3M16 8v3M6 14h3.5a1.5 1.5 0 0 0 0-3H6',
  throw: 'M4 18c4-1 7-4 9-8m0 0-4 .5m4-.5.5 4M15 6l2-2m1 5 2.5-1M14 3l.5-1',
  point: 'M10 13V4.5a1.5 1.5 0 0 1 3 0V11l4.2.9A2.5 2.5 0 0 1 19 14.3V16a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-4.3-2.4L5.5 15a1.5 1.5 0 0 1 2.3-1.9L10 15',
  victory:
    'M8 12 6.2 4.6a1.5 1.5 0 0 1 2.9-.7L11 11m0 0 .6-7.4a1.5 1.5 0 0 1 3 .2L14 11m0 0h2.5a2.5 2.5 0 0 1 2.5 2.5V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6v-1.5A2.5 2.5 0 0 1 8.5 11z',
  zoom: 'M10.5 3.5a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm5 12.5 4.5 4.5M10.5 6.5v4m-2-2h4m-4 4.5h4',
  pocket: 'M3 11h18v5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zm4-4 3-3m4 3-3-3v8',
  voice: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zm-6 8a6 6 0 0 0 12 0m-6 6v4m-3 0h6',
  hand: 'M12 3v4m0 10v4M3 12h4m10 0h4M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  light: 'M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4L17 7M7 17l-1.4 1.4m0-12.8L7 7m10 10 1.4 1.4M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
}

export function icon(name: UiIcon, className = 'app-icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', className)
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', ICON_PATHS[name])
  svg.append(path)
  return svg
}
