import type { HintEvt } from '../contracts/input'
import type { InputSource } from '../contracts/input'
import { CameraInput } from '../motion'
import { MouseInput } from '../shared/mouse-input'
import { DEMO_IDEAS, demoImage } from './demo-assets'
import { createBoard, PALETTE, type Board, type ElementKind, type NewElement } from './index'
import './demo.css'

/** Демо S2: доска на MouseInput и панель добавления фигур, которую позже заменит карман S3. */

const KIND_LABELS: Readonly<Record<ElementKind, string>> = {
  sticky: 'Стикер',
  rect: 'Прямоуг.',
  square: 'Квадрат',
  circle: 'Круг',
  triangle: 'Треуг.',
  image: 'Картинка',
}
const STRESS_COUNT = 50
const STRESS_SPREAD = 1400
const HINT_MS = 2500
const FPS_WINDOW_MS = 500

let imageSeq = 0

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Readonly<Record<string, unknown>> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  Object.assign(node, props)
  node.append(...kids)
  return node
}

function button(label: string, onClick: () => void, kind?: ElementKind): HTMLButtonElement {
  const b = el('button', { type: 'button', className: 'demo-btn' })
  if (kind) {
    const ico = el('span', { className: 'demo-ico' })
    ico.dataset.k = kind
    b.append(ico)
  }
  b.append(label)
  b.addEventListener('click', onClick)
  return b
}

function section(label: string, ...kids: Node[]): HTMLElement {
  return el('div', { className: 'demo-section' }, el('div', { className: 'demo-label', textContent: label }), ...kids)
}

function specFor(kind: ElementKind, text: string): NewElement {
  if (kind === 'sticky') return { kind, text: text || DEMO_IDEAS[imageSeq++ % DEMO_IDEAS.length] || '' }
  if (kind === 'image') return { kind, src: demoImage(imageSeq++) }
  return { kind }
}

function randomSpec(i: number): NewElement {
  const kinds = Object.keys(KIND_LABELS) as ElementKind[]
  const kind = kinds[i % kinds.length] ?? 'sticky'
  const palette = PALETTE[kind]
  return {
    ...specFor(kind, ''),
    x: (Math.random() - 0.5) * STRESS_SPREAD,
    y: (Math.random() - 0.5) * STRESS_SPREAD * 0.6,
    rotation: (Math.random() - 0.5) * 16,
    color: palette[i % palette.length],
  }
}

function addImageFromFile(board: Board, file: File): void {
  if (!file.type.startsWith('image/')) return
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') board.addElement({ kind: 'image', src: reader.result })
  }
  reader.readAsDataURL(file)
}

function shapesSection(board: Board, text: HTMLInputElement): HTMLElement {
  const kinds = Object.keys(KIND_LABELS) as ElementKind[]
  const grid = el('div', { className: 'demo-grid' })
  kinds.forEach((k) => grid.append(button(KIND_LABELS[k], () => board.addElement(specFor(k, text.value.trim())), k)))
  const file = el('input', { type: 'file', accept: 'image/*', hidden: true })
  file.addEventListener('change', () => {
    const f = file.files?.[0]
    if (f) addImageFromFile(board, f)
    file.value = ''
  })
  return section('Добавить', grid, text, button('Своя картинка…', () => file.click()), file)
}

function textInput(board: Board): HTMLInputElement {
  const input = el('input', { className: 'demo-input', placeholder: 'Текст стикера', title: 'Enter — записать в выделенный элемент' })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const id = board.getState().selectedId
    if (e.key !== 'Enter' || !id) return
    board.updateElement(id, { text: input.value.trim() })
    input.value = ''
  })
  return input
}

function historySection(board: Board): HTMLElement {
  const undo = button('Отменить', () => board.undo())
  const redo = button('Вернуть', () => board.redo())
  const stress = button(`+${STRESS_COUNT} штук`, () => {
    for (let i = 0; i < STRESS_COUNT; i++) board.addElement(randomSpec(i), { animate: false })
  })
  const home = button('К центру', () => board.setCamera({ x: 0, y: 0, zoom: 1 }))
  const sync = () => {
    undo.disabled = !board.canUndo()
    redo.disabled = !board.canRedo()
  }
  board.subscribe(sync)
  sync()
  return section('Доска', el('div', { className: 'demo-grid' }, undo, redo, stress, home))
}

function helpSection(): HTMLElement {
  const items = [
    '<kbd>ЛКМ</kbd> по элементу — взять, отпустить — упадёт',
    'Резкий бросок — улетит и удалится',
    'Перетаскивание <kbd>ПКМ</kbd>, средней кнопкой или <kbd>Пробел</kbd> + <kbd>ЛКМ</kbd> — панорама, как жест двух пальцев',
    '<kbd>Колесо</kbd> или <kbd>Alt</kbd> + перетаскивание вверх-вниз — масштаб, как щипок',
    '<kbd>Shift</kbd> + удержание 0,6 с — выделить, затем так же по кнопке плашки',
    '<kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Shift+Z</kbd>, <kbd>Delete</kbd>',
  ]
  const list = el('ul', { className: 'demo-help' })
  items.forEach((html) => list.append(el('li', { innerHTML: html })))
  return section('Мышь вместо рук', list)
}

function statsBar(board: Board): HTMLElement {
  const fps = el('b', { textContent: '—' })
  const count = el('b', { textContent: '0' })
  let frames = 0
  let since = performance.now()
  const loop = (t: number) => {
    frames += 1
    if (t - since >= FPS_WINDOW_MS) {
      fps.textContent = String(Math.round((frames * 1000) / (t - since)))
      frames = 0
      since = t
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
  board.subscribe((s) => (count.textContent = String(s.elements.length)))
  return el('div', { className: 'demo-stats' }, el('span', {}, 'FPS ', fps), el('span', {}, 'элементов ', count))
}

function hintToast(board: Board): HTMLElement {
  const toast = el('div', { className: 'demo-hint' })
  let timer: ReturnType<typeof setTimeout> | undefined
  board.on('hint', (h: HintEvt) => {
    toast.textContent = h.message
    toast.dataset.severity = h.severity
    toast.classList.add('is-on')
    clearTimeout(timer)
    timer = setTimeout(() => toast.classList.remove('is-on'), HINT_MS)
  })
  return toast
}

function bindKeys(board: Board): void {
  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) board.redo()
      else board.undo()
    }
    const id = board.getState().selectedId
    if ((e.key === 'Delete' || e.key === 'Backspace') && id) board.removeElement(id)
  })
}

/** Панель не должна отдавать нажатия и колесо эмулятору жестов. */
function isolate(panel: HTMLElement): void {
  ;['pointerdown', 'wheel'].forEach((type) => panel.addEventListener(type, (e) => e.stopPropagation()))
}

function seed(board: Board): void {
  const items: NewElement[] = [
    { kind: 'sticky', x: -260, y: -120, text: 'Возьми меня кулаком', rotation: -3 },
    { kind: 'sticky', x: -40, y: -150, text: 'Брось резко — улечу', color: PALETTE.sticky[1], rotation: 2 },
    { kind: 'rect', x: 260, y: -110 },
    { kind: 'circle', x: -220, y: 150 },
    { kind: 'triangle', x: 20, y: 140 },
    { kind: 'square', x: 230, y: 150, rotation: 12 },
    { kind: 'image', x: 520, y: 20, src: demoImage(imageSeq++) },
  ]
  items.forEach((spec) => board.addElement(spec, { animate: false }))
}

/** ?input=camera подключает камеру вместо мыши и показывает превью в углу. */
function createInput(app: HTMLElement): InputSource {
  if (new URLSearchParams(location.search).get('input') !== 'camera') return new MouseInput(window)
  const video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, className: 'demo-cam' })
  app.append(video)
  return new CameraInput({ video })
}

function main(): void {
  const app = document.getElementById('app')
  if (!app) throw new Error('#app not found')
  const input = createInput(app)
  const board = createBoard(app, input)
  const text = textInput(board)
  const panel = el(
    'aside',
    { className: 'demo-panel' },
    el('h1', { className: 'demo-title', innerHTML: 'Motion <b>Board</b> · доска' }),
    shapesSection(board, text),
    historySection(board),
    helpSection(),
    statsBar(board),
  )
  isolate(panel)
  app.append(panel, hintToast(board))
  bindKeys(board)
  seed(board)
  input.start().catch((err: unknown) =>
    board.emitHint({ code: 'CAMERA_FAILED', message: err instanceof Error ? err.message : 'Камера недоступна, открой страницу без ?input=camera', severity: 'warn' }),
  )
  Object.assign(window, { board })
}

main()
