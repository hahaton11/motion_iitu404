import type { Board } from '../board'
import './voice.css'

/** Отступ кольца записи от краёв стикера, пиксели экрана. */
export const RING_PAD_PX = 8

const div = (className: string, text = ''): HTMLElement =>
  Object.assign(document.createElement('div'), { className, textContent: text })

/**
 * Индикатор записи поверх стикера: пульсирующее кольцо, плашка «Говори» и промежуточный текст.
 * Живёт в экранном слое доски и каждый кадр встаёт на место стикера.
 */
export class VoiceIndicator {
  private readonly root: HTMLElement
  private readonly ring: HTMLElement
  private readonly pill: HTMLElement
  private readonly interim: HTMLElement
  private id: string | undefined
  private frame = 0

  constructor(private readonly board: Board) {
    this.root = div('vc-indicator')
    this.ring = div('vc-ring')
    this.pill = div('vc-pill')
    this.pill.append(div('vc-dot'), div('vc-pill-text', 'Говори, я записываю'))
    this.interim = div('vc-interim')
    this.root.append(this.ring, this.pill, this.interim)
    board.layers.overlay.append(this.root)
  }

  show(id: string): void {
    this.id = id
    this.interim.textContent = ''
    this.root.classList.add('is-on')
    this.place()
    if (!this.frame) this.loop()
  }

  setInterim(text: string): void {
    this.interim.textContent = text
    this.interim.classList.toggle('is-on', text.length > 0)
  }

  hide(): void {
    this.id = undefined
    this.root.classList.remove('is-on')
    this.interim.classList.remove('is-on')
    cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  destroy(): void {
    this.hide()
    this.root.remove()
  }

  private loop(): void {
    this.frame = requestAnimationFrame(() => {
      this.place()
      if (this.id) this.loop()
    })
  }

  private place(): void {
    const el = this.id ? this.board.getElement(this.id) : undefined
    if (!el) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const zoom = this.board.getState().camera.zoom
    const c = this.board.toScreen({ x: el.x, y: el.y })
    const w = el.w * zoom + RING_PAD_PX * 2
    const h = el.h * zoom + RING_PAD_PX * 2
    const s = this.root.style
    s.setProperty('--vc-x', `${c.x * vw}px`)
    s.setProperty('--vc-y', `${c.y * vh}px`)
    s.setProperty('--vc-w', `${w}px`)
    s.setProperty('--vc-h', `${h}px`)
    s.setProperty('--vc-r', `${el.rotation}deg`)
  }
}
