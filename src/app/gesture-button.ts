import type { CursorEvt, HandId, InputSource } from '../contracts/input'
import { el, icon, isolate, type UiIcon } from './dom'
import { initialDwell, stepDwell, type DwellState } from './dwell'

/**
 * Кнопки, которые нажимаются и мышью, и удержанием открытой ладони над ними.
 * Реестр слушает курсор ввода, ищет кнопку под прицелом и крутит кольцо прогресса.
 * Мышь без движения не шлёт cursor, поэтому пока прицел на кнопке, тикает свой кадр.
 */

export interface GestureButtonOptions {
  readonly label: string
  readonly onPress: () => void
  readonly variant?: 'primary' | 'ghost' | 'small'
  readonly icon?: UiIcon
  readonly className?: string
}

/** Повторное нажатие той же кнопки раньше этого игнорируется: клик после срабатывания ладонью. */
const REPRESS_MS = 700

interface HandCursor {
  readonly x: number
  readonly y: number
  readonly closure: number
}

interface Entry {
  readonly id: string
  readonly node: HTMLButtonElement
  readonly press: () => void
  lastPress: number
}

export class GestureButtons {
  private readonly entries = new Map<string, Entry>()
  private readonly cursors = new Map<HandId, HandCursor>()
  private dwell = new Map<HandId, DwellState>()
  private seq = 0
  private frame = 0

  constructor(input: InputSource, private readonly onPressSound: () => void = () => undefined) {
    input.on('cursor', (e) => this.onCursor(e))
    input.on('handlost', (e) => {
      this.cursors.delete(e.hand)
      this.dwell.delete(e.hand)
      this.update(performance.now())
    })
  }

  create(opts: GestureButtonOptions): HTMLButtonElement {
    this.seq += 1
    const id = `gb-${this.seq}`
    const node = el('button', `app-btn is-${opts.variant ?? 'primary'} ${opts.className ?? ''}`.trim())
    node.type = 'button'
    node.dataset.gb = id
    const fill = el('span', 'app-btn-fill')
    const label = el('span', 'app-btn-label')
    label.textContent = opts.label
    node.append(fill, ...(opts.icon ? [icon(opts.icon, 'app-btn-icon')] : []), label)
    isolate(node)
    const entry: Entry = { id, node, press: opts.onPress, lastPress: -Infinity }
    node.addEventListener('click', () => this.fire(entry))
    this.entries.set(id, entry)
    return node
  }

  private fire(entry: Entry): void {
    const now = performance.now()
    if (now - entry.lastPress < REPRESS_MS || entry.node.disabled) return
    entry.lastPress = now
    this.onPressSound()
    entry.press()
  }

  private onCursor(e: CursorEvt): void {
    // Курсор панорамы и зума стоит на месте, пока доска двигается: задержка на кнопке тут не нажатие.
    const closure = e.panning === true || e.zooming === true ? 1 : e.closure
    this.cursors.set(e.hand, { x: e.x * window.innerWidth, y: e.y * window.innerHeight, closure })
    this.update(performance.now())
  }

  private targetAt(c: HandCursor): Entry | undefined {
    for (const entry of this.entries.values()) {
      if (!entry.node.isConnected) {
        this.entries.delete(entry.id)
        continue
      }
      if (entry.node.disabled || entry.node.offsetParent === null) continue
      const r = entry.node.getBoundingClientRect()
      if (c.x >= r.left && c.x <= r.right && c.y >= r.top && c.y <= r.bottom) return entry
    }
    return undefined
  }

  private update(t: number): void {
    const progress = new Map<string, number>()
    const fired: Entry[] = []
    const next = new Map<HandId, DwellState>()
    this.cursors.forEach((c, hand) => {
      const target = this.targetAt(c)
      const r = stepDwell(this.dwell.get(hand) ?? initialDwell(), { target: target?.id, closure: c.closure, t })
      next.set(hand, r.state)
      if (target) progress.set(target.id, Math.max(progress.get(target.id) ?? 0, r.progress))
      if (r.fire && target) fired.push(target)
    })
    this.dwell = next
    this.entries.forEach((entry) => {
      const p = progress.get(entry.id) ?? 0
      entry.node.style.setProperty('--dwell', p.toFixed(3))
      entry.node.classList.toggle('is-aimed', progress.has(entry.id))
    })
    fired.forEach((entry) => this.fire(entry))
    this.schedule(progress.size > 0)
  }

  private schedule(active: boolean): void {
    if (!active || this.frame) return
    this.frame = requestAnimationFrame((t) => {
      this.frame = 0
      this.update(t)
    })
  }
}
