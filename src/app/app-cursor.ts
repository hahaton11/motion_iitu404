import type { HandId, InputSource } from '../contracts/input'
import { el } from './dom'

/** Выше этого closure прицел рисуется сжатым. */
const FIST_VIEW = 0.5

/**
 * Прицел приложения на экранах без доски: старт, камера, калибровка, финал.
 * На досочных экранах прицел рисует сама доска, этот прячется.
 */
export class AppCursor {
  private readonly layer: HTMLElement
  private readonly dots = new Map<HandId, HTMLElement>()
  private enabled = true

  constructor(host: HTMLElement, input: InputSource) {
    this.layer = el('div', 'app-cursors')
    host.append(this.layer)
    input.on('cursor', (e) => {
      const dot = this.dot(e.hand)
      dot.style.transform = `translate3d(${e.x * window.innerWidth}px, ${e.y * window.innerHeight}px, 0)`
      dot.classList.toggle('is-fist', e.closure > FIST_VIEW)
      dot.classList.remove('is-hidden')
    })
    input.on('handlost', (e) => this.dots.get(e.hand)?.classList.add('is-hidden'))
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    this.layer.classList.toggle('is-off', !on)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  private dot(hand: HandId): HTMLElement {
    const known = this.dots.get(hand)
    if (known) return known
    const dot = el('div', 'app-cursor')
    this.layer.append(dot)
    this.dots.set(hand, dot)
    return dot
  }
}
