import type { Board } from '../board'
import type { HandId, InputSource } from '../contracts/input'
import type { Unsubscribe } from '../pocket/emitter'
import { tipTarget } from './tip-target'

/** Зазор между нижним краем стикера и подсказкой, пиксели экрана. */
export const TIP_GAP_PX = 10

const MIC_PATH = 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zm-6 8a6 6 0 0 0 12 0m-6 6v4m-3 0h6'
const SVG_NS = 'http://www.w3.org/2000/svg'

function micIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'vc-tip-icon')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', MIC_PATH)
  svg.append(path)
  return svg
}

/**
 * Подсказка под стикером, на который наведён прицел или который выделен: как начать диктовку.
 * Текст даёт приложение: он зависит от режима ввода и разрешения на микрофон.
 */
export class VoiceTip {
  private readonly root: HTMLElement
  private readonly label: HTMLElement
  private readonly hovered = new Map<HandId, string>()
  private readonly disposers: Unsubscribe[] = []
  private recordingId: string | undefined

  constructor(
    private readonly board: Board,
    input: InputSource | undefined,
    private readonly text: () => string,
  ) {
    this.label = Object.assign(document.createElement('span'), { className: 'vc-tip-text' })
    this.root = Object.assign(document.createElement('div'), { className: 'vc-tip' })
    this.root.append(micIcon(), this.label)
    board.layers.overlay.append(this.root)
    this.disposers.push(board.subscribe(() => this.render()))
    if (input) {
      this.disposers.push(
        input.on('cursor', (e) => this.hover(e.hand, e.x, e.y)),
        input.on('handlost', (e) => {
          this.hovered.delete(e.hand)
          this.render()
        }),
      )
    }
  }

  setRecording(id: string | undefined): void {
    this.recordingId = id
    this.render()
  }

  destroy(): void {
    this.disposers.splice(0).forEach((d) => d())
    this.root.remove()
  }

  private hover(hand: HandId, x: number, y: number): void {
    const hit = this.board.elementAt(x, y)
    if (hit?.kind === 'sticky') this.hovered.set(hand, hit.id)
    else this.hovered.delete(hand)
    this.render()
  }

  private render(): void {
    const state = this.board.getState()
    const selected = state.elements.find((e) => e.id === state.selectedId)
    const id = tipTarget({
      hovered: [...this.hovered.values()],
      ...(selected?.kind === 'sticky' ? { selectedId: selected.id } : {}),
      ...(state.held ? { heldId: state.held.id } : {}),
      ...(this.recordingId ? { recordingId: this.recordingId } : {}),
    })
    const el = id ? this.board.getElement(id) : undefined
    this.root.classList.toggle('is-on', el !== undefined)
    if (!el) return
    const text = this.text()
    if (this.label.textContent !== text) this.label.textContent = text
    const c = this.board.toScreen({ x: el.x, y: el.y })
    const bottom = c.y * window.innerHeight + (el.h * state.camera.zoom) / 2 + TIP_GAP_PX
    this.root.style.setProperty('--vc-x', `${c.x * window.innerWidth}px`)
    this.root.style.setProperty('--vc-y', `${bottom}px`)
  }
}
