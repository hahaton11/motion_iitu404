/** Картинки для демо без внешних файлов: SVG-пейзажи в data URL. */
const SCENES: readonly (readonly [string, string, string, string])[] = [
  ['#0f2a4a', '#5ad1ff', '#1b3d63', '#ffe27a'],
  ['#2a1238', '#ff9fb2', '#4a1f5c', '#ffd1a1'],
  ['#0e2f2a', '#3fe0b0', '#154a3f', '#e6edf7'],
]

export function demoImage(i: number): string {
  const [sky, glow, hill, sun] = SCENES[i % SCENES.length] ?? SCENES[0] ?? ['#000', '#fff', '#333', '#ff0']
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${glow}"/></linearGradient></defs>
<rect width="240" height="180" fill="url(#g)"/>
<circle cx="170" cy="62" r="24" fill="${sun}" opacity="0.9"/>
<path d="M0 130 L60 80 L110 120 L160 70 L240 125 L240 180 L0 180 Z" fill="${hill}"/>
<path d="M0 150 L80 115 L150 150 L240 120 L240 180 L0 180 Z" fill="${sky}" opacity="0.85"/>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export const DEMO_IDEAS: readonly string[] = [
  'Жест «щипок» для выделения',
  'Карман внизу экрана',
  'Голосом диктовать стикеры',
  'Бросок удаляет элемент',
  'Две руки — масштаб',
  'Подсказки, что исправить',
  'Таблица рекордов',
  'Экспорт доски в PNG',
]
