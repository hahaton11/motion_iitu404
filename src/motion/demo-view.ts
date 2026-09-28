import type { HandId, HintEvt } from '../contracts/input'
import type { FrameInfo } from './camera-input'
import type { HandDebug } from './pipeline'
import type { Thresholds } from './types'

/** DOM демо-страницы: разметка и отрисовка состояния. Без логики распознавания. */

export const FIXTURE_GESTURES = ['open', 'fist', 'pinch', 'point', 'half-closed', 'zoom', 'throw'] as const
const LOG_LIMIT = 40
const TOAST_MS = 2500
const PERCENT = 100

const PHASE_TEXT: Readonly<Record<string, string>> = {
  open: 'open, ладонь',
  closing: 'closing, сжимается',
  holding: 'holding, держит',
  opening: 'opening, раскрывается',
}

const html = String.raw

function handCard(hand: HandId): string {
  const title = hand === 'right' ? 'Правая рука' : 'Левая рука'
  return html`<section class="md-card" data-hand="${hand}">
    <h3>${title}</h3>
    <div class="md-row"><span>состояние</span><span class="md-phase" data-f="phase">нет руки</span></div>
    <div class="md-bar"><div class="md-bar-fill" data-f="bar"></div><div class="md-mark md-open" data-f="mark-open"></div><div class="md-mark" data-f="mark-hold"></div></div>
    <div class="md-row"><span>closure</span><span data-f="closure">—</span></div>
    <div class="md-row"><span>указательный</span><span data-f="index">—</span></div>
    <div class="md-row"><span>размер ладони</span><span data-f="palm">—</span></div>
    <div class="md-row"><span>уверенность</span><span data-f="score">—</span></div>
    <div class="md-row"><span>прицел</span><span data-f="cursor">—</span></div>
  </section>`
}

const TEMPLATE = html`<div class="md">
  <div class="md-stage">
    <video playsinline muted></video>
    <canvas></canvas>
    <div class="md-empty" data-f="empty">Нажми «Включить камеру». Модель и wasm загружаются локально из public/.</div>
  </div>
  <aside class="md-panel">
    <section class="md-card">
      <div class="md-buttons">
        <button class="md-primary" data-a="start">Включить камеру</button>
        <button data-a="calibrate" disabled>Калибровка</button>
        <button data-a="record" disabled>Записать 30 секунд</button>
        <select data-a="gesture">${FIXTURE_GESTURES.map((g) => `<option>${g}</option>`).join('')}</select>
        <button data-a="frames" disabled>Сохранить кадры</button>
      </div>
    </section>
    <section class="md-card">
      <h3>Кадр</h3>
      <div class="md-row"><span>FPS</span><span data-f="fps">—</span></div>
      <div class="md-row"><span>обработка кадра</span><span data-f="latency">—</span></div>
      <div class="md-row"><span>delegate</span><span data-f="delegate">—</span></div>
      <div class="md-row"><span>пороги open / hold</span><span data-f="thresholds">—</span></div>
    </section>
    ${handCard('right')}
    ${handCard('left')}
    <section class="md-card"><h3>События</h3><div class="md-log" data-f="log"></div></section>
  </aside>
  <div class="md-toast" data-f="toast"></div>
  <div class="md-calib" data-f="calib"><div data-f="calib-text"></div><div class="md-bar"><div class="md-bar-fill" data-f="calib-bar"></div></div></div>
  <div class="md-cursor" data-cursor="right"></div>
  <div class="md-cursor md-left" data-cursor="left"></div>
</div>`

export class DemoView {
  readonly video: HTMLVideoElement
  readonly canvas: HTMLCanvasElement
  private toastTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = TEMPLATE
    this.video = this.q<HTMLVideoElement>('video')
    this.canvas = this.q<HTMLCanvasElement>('canvas')
  }

  q<T extends Element>(sel: string): T {
    const el = this.root.querySelector<T>(sel)
    if (!el) throw new Error(`Demo markup is missing ${sel}`)
    return el
  }

  field(name: string, scope: ParentNode = this.root): HTMLElement {
    const el = scope.querySelector<HTMLElement>(`[data-f="${name}"]`)
    if (!el) throw new Error(`Demo markup is missing field ${name}`)
    return el
  }

  action<T extends HTMLElement = HTMLButtonElement>(name: string): T {
    return this.q<T>(`[data-a="${name}"]`)
  }

  renderFrame(info: FrameInfo): void {
    this.field('fps').textContent = info.stats.fps.toFixed(0)
    this.field('latency').textContent = `${info.stats.latencyMs.toFixed(1)} мс`
    this.field('delegate').textContent = info.delegate
    this.field('thresholds').textContent = `${info.thresholds.open.toFixed(2)} / ${info.thresholds.hold.toFixed(2)}`
    ;(['left', 'right'] as const).forEach((hand) => this.renderHand(hand, info.hands.find((h) => h.hand === hand), info.thresholds))
  }

  private renderHand(hand: HandId, d: HandDebug | undefined, th: Thresholds): void {
    const card = this.q<HTMLElement>(`[data-hand="${hand}"]`)
    const set = (f: string, v: string): void => {
      this.field(f, card).textContent = v
    }
    this.field('mark-open', card).style.left = `${th.open * PERCENT}%`
    this.field('mark-hold', card).style.left = `${th.hold * PERCENT}%`
    const bar = this.field('bar', card)
    const cursor = this.q<HTMLElement>(`[data-cursor="${hand}"]`)
    if (!d) {
      set('phase', 'нет руки')
      bar.style.width = '0'
      cursor.style.display = 'none'
      return
    }
    const holding = d.phase === 'holding' || d.phase === 'opening'
    const pose = d.pose ? ` · поза ${d.pose}${d.detection.pose ? ` (${d.detection.pose.label} ${d.detection.pose.confidence.toFixed(2)})` : ''}` : ''
    set('phase', `${PHASE_TEXT[d.phase] ?? d.phase}${pose}${d.paused ? ' · пауза' : ''}`)
    set('closure', d.features.closure.toFixed(2))
    set('index', d.features.indexOnly ? 'только он вытянут' : 'нет')
    set('palm', d.features.palmSize.toFixed(3))
    set('score', d.detection.score.toFixed(2))
    set('cursor', `${d.screen.x.toFixed(3)}, ${d.screen.y.toFixed(3)}`)
    bar.style.width = `${d.features.closure * PERCENT}%`
    bar.classList.toggle('md-holding', holding)
    cursor.style.display = 'block'
    cursor.style.left = `${d.screen.x * window.innerWidth}px`
    cursor.style.top = `${d.screen.y * window.innerHeight}px`
    cursor.classList.toggle('md-holding', holding)
  }

  log(text: string): void {
    const log = this.field('log')
    const line = document.createElement('div')
    line.textContent = `${new Date().toLocaleTimeString()} ${text}`
    log.prepend(line)
    while (log.childElementCount > LOG_LIMIT) log.lastElementChild?.remove()
  }

  toast(h: HintEvt): void {
    const el = this.field('toast')
    el.textContent = h.message
    el.classList.add('md-show')
    clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => el.classList.remove('md-show'), TOAST_MS)
  }

  showCalibration(text: string | undefined, progress = 0): void {
    this.field('calib').classList.toggle('md-show', text !== undefined)
    this.field('calib-text').textContent = text ?? ''
    this.field('calib-bar').style.width = `${progress * PERCENT}%`
  }

  setEmpty(text: string | undefined): void {
    const el = this.field('empty')
    el.style.display = text === undefined ? 'none' : 'block'
    el.textContent = text ?? ''
  }
}
