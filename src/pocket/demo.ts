import { createBoard, PALETTE, type Board } from '../board'
import type { CursorEvt, HintEvt, InputEventMap, InputEventType, InputSource } from '../contracts/input'
import { CameraInput } from '../motion'
import { MouseInput } from '../shared/mouse-input'
import { createVoice } from '../voice'
import { createPocket, type Pocket } from './index'
import './demo.css'

/** Демо S3: доска, карман и голос вместе на MouseInput. */

const HINT_MS = 2800
const LOG_SIZE = 5
/** Клавиша, пока зажата, делает кулак «наполовину сжатым», чтобы воспроизвести подсказку кармана. */
const HALF_KEY = 'c'
const HALF_CLOSURE = 0.6

/** Обёртка над мышью: с зажатой клавишей C closure становится 0.6, как у неуверенного кулака. */
class HalfFistInput implements InputSource {
  private half = false

  constructor(private readonly inner: InputSource) {
    window.addEventListener('keydown', (e) => e.key.toLowerCase() === HALF_KEY && (this.half = true))
    window.addEventListener('keyup', (e) => e.key.toLowerCase() === HALF_KEY && (this.half = false))
  }

  on<K extends InputEventType>(type: K, fn: (e: InputEventMap[K]) => void): () => void {
    if (type !== 'cursor') return this.inner.on(type, fn)
    const wrap = (e: CursorEvt) => fn((this.half && e.holding ? { ...e, closure: HALF_CLOSURE } : e) as InputEventMap[K])
    return this.inner.on('cursor', wrap)
  }

  start(): Promise<void> {
    return this.inner.start()
  }

  stop(): void {
    this.inner.stop()
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  node.innerHTML = html
  return node
}

function helpPanel(): HTMLElement {
  const panel = el('aside', 'pd-panel')
  const rows = [
    ['Положить', 'возьми элемент <kbd>ЛКМ</kbd>, опусти к карману внизу и отпусти'],
    ['Открыть', 'пустой курсор над карманом 0,4 с'],
    ['Достать', '<kbd>ЛКМ</kbd> по карточке веера. С замком — копия'],
    ['Листать', 'быстрый мах влево или вправо над веером'],
    ['Голос', '<kbd>Shift</kbd> + удержание 0,6 с на стикере, говори, пауза 1,5 с'],
    ['Подготовка', 'кнопка справа вверху, там <kbd>Ctrl+V</kbd> и перетаскивание файлов'],
  ]
  const hints = [
    'держи элемент чуть выше кармана 0,7 с',
    'наведи пустой курсор на карман и уведи раньше 0,4 с',
    'держи элемент над карманом с зажатой <kbd>C</kbd> 0,6 с',
  ]
  panel.innerHTML = `
    <h1 class="pd-title">Motion Board · <b>карман</b></h1>
    <dl class="pd-rows">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <div class="pd-label">Подсказки кармана</div>
    <ol class="pd-hints">${hints.map((h) => `<li>${h}</li>`).join('')}</ol>
    <div class="pd-label">События</div>`
  return panel
}

function eventLog(pocket: Pocket): HTMLElement {
  const log = el('ul', 'pd-log')
  const push = (text: string) => {
    const li = el('li')
    li.textContent = text
    log.prepend(li)
    while (log.children.length > LOG_SIZE) log.lastElementChild?.remove()
  }
  pocket.on('put', ({ element }) => push(`положен: ${element.kind}`))
  pocket.on('take', ({ item }) => push(item.type === 'preset' ? `копия заготовки: ${item.content.kind}` : `достан: ${item.content.kind}`))
  pocket.on('open', () => push('веер открыт'))
  pocket.on('prep', ({ on }) => push(on ? 'режим подготовки' : 'обычный режим'))
  return log
}

function hintToast(board: Board): HTMLElement {
  const toast = el('div', 'pd-hint')
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

function seed(board: Board): void {
  board.addElement({ kind: 'sticky', x: -220, y: -90, text: 'Положи меня в карман', rotation: -3 }, { animate: false })
  board.addElement({ kind: 'sticky', x: 20, y: -120, text: 'Укажи на меня и продиктуй', color: PALETTE.sticky[2] }, { animate: false })
  board.addElement({ kind: 'triangle', x: 250, y: -60 }, { animate: false })
}

/** ?input=camera подключает камеру вместо мыши и показывает превью в углу. */
function createInput(app: HTMLElement): InputSource {
  if (new URLSearchParams(location.search).get('input') !== 'camera') return new HalfFistInput(new MouseInput(window))
  const video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, className: 'demo-cam' })
  app.append(video)
  return new CameraInput({ video })
}

function main(): void {
  const app = document.getElementById('app')
  if (!app) throw new Error('#app not found')
  const input = createInput(app)
  const board = createBoard(app, input)
  const pocket = createPocket(board.layers.overlay, input, board)
  createVoice(board, input)
  seed(board)
  const panel = helpPanel()
  panel.append(eventLog(pocket))
  ;['pointerdown', 'wheel'].forEach((t) => panel.addEventListener(t, (e) => e.stopPropagation()))
  document.body.append(panel, hintToast(board))
  input.start().catch((err: unknown) =>
    board.emitHint({ code: 'CAMERA_FAILED', message: err instanceof Error ? err.message : 'Камера недоступна, открой страницу без ?input=camera', severity: 'warn' }),
  )
}

main()
