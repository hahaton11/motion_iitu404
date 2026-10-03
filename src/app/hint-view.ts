import type { HintEvt, InputSource } from '../contracts/input'
import { hintInfo } from './advice'
import { el, icon } from './dom'
import {
  dismissHint,
  initialHintLayer,
  offerHint,
  resetStats,
  tickHints,
  type HintLayerState,
} from './hint-layer'

/**
 * Единый слой подсказок: тост с иконкой жеста рядом с прицелом.
 * Источники: подсказки камеры из ввода и подсказки доски, кармана, голоса и сценария через offer.
 */

const OFFSET_X = 28
const OFFSET_Y = 24
const EDGE = 16
const TICK_MS = 200

export class HintToaster {
  private state: HintLayerState = initialHintLayer()
  private readonly node: HTMLElement
  private readonly iconSlot: HTMLElement
  private readonly message: HTMLElement
  private cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(host: HTMLElement, input: InputSource) {
    this.iconSlot = el('div', 'app-hint-icon')
    this.message = el('div', 'app-hint-text')
    this.node = el('div', 'app-hint', this.iconSlot, this.message)
    this.node.setAttribute('role', 'status')
    this.node.setAttribute('aria-live', 'polite')
    host.append(this.node)
    input.on('hint', (h) => this.offer(h))
    input.on('cursor', (e) => {
      this.cursor = { x: e.x * window.innerWidth, y: e.y * window.innerHeight }
      if (this.state.current) this.place()
    })
  }

  offer(hint: HintEvt): void {
    // Условие подсказки ушло: человек исправился, и тост пора убрать, не досиживая его время.
    // Само снятие не подсказка — его не показывают и не считают в разборе ошибок на финале.
    if (hint.cleared) return this.clear(hint.code)
    const r = offerHint(this.state, hint, performance.now())
    this.state = r.state
    if (r.show) this.show(r.show)
  }

  /** Убрать с экрана подсказку с этим кодом, если сейчас висит именно она. */
  private clear(code: string): void {
    if (this.state.current?.hint.code !== code) return
    this.state = dismissHint(this.state)
    this.hide()
  }

  /** Правильное действие убирает подсказку. */
  dismiss(): void {
    this.state = dismissHint(this.state)
    this.hide()
  }

  /** Показанные подсказки по кодам с последнего сброса. */
  counts(): Readonly<Record<string, number>> {
    return this.state.counts
  }

  resetStats(): void {
    this.state = resetStats(this.state)
  }

  private show(hint: HintEvt): void {
    this.iconSlot.replaceChildren(icon(hintInfo(hint.code).icon))
    this.message.textContent = hint.message
    this.node.dataset.severity = hint.severity
    this.node.classList.add('is-on')
    this.place()
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  private tick(): void {
    const r = tickHints(this.state, performance.now())
    this.state = r.state
    if (r.hide) this.hide()
  }

  private hide(): void {
    this.node.classList.remove('is-on')
    clearInterval(this.timer)
    this.timer = undefined
  }

  /** Справа снизу от прицела; у края экрана перескакивает на другую сторону. */
  private place(): void {
    const w = this.node.offsetWidth
    const h = this.node.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x = this.cursor.x + OFFSET_X
    let y = this.cursor.y + OFFSET_Y
    if (x + w > vw - EDGE) x = this.cursor.x - OFFSET_X - w
    if (y + h > vh - EDGE) y = this.cursor.y - OFFSET_Y - h
    x = Math.min(vw - w - EDGE, Math.max(EDGE, x))
    y = Math.min(vh - h - EDGE, Math.max(EDGE, y))
    this.node.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
  }
}
