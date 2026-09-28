import type { Viewport } from './geometry'
import type { BoardState } from './model'
import { TOOLBAR_ACTIONS, TOOLBAR_LABELS, toolbarLayout, type ToolbarAction } from './toolbar'

/** DOM плашки действий над выделенным элементом. Раскладка берётся из чистого toolbarLayout. */
export class ToolbarView {
  private readonly root: HTMLElement
  private readonly buttons = new Map<ToolbarAction, HTMLElement>()
  private hover = new Set<ToolbarAction>()

  constructor(overlay: HTMLElement) {
    this.root = Object.assign(document.createElement('div'), { className: 'mb-toolbar' })
    TOOLBAR_ACTIONS.forEach((action) => {
      const b = Object.assign(document.createElement('div'), { className: 'mb-tool' })
      b.dataset.action = action
      b.append(Object.assign(document.createElement('span'), { textContent: TOOLBAR_LABELS[action] }))
      this.root.append(b)
      this.buttons.set(action, b)
    })
    overlay.append(this.root)
  }

  render(state: BoardState, vp: Viewport, hover: ReadonlySet<ToolbarAction>): void {
    const sel = state.selectedId && !state.held ? state.elements.find((e) => e.id === state.selectedId) : undefined
    this.root.classList.toggle('is-open', sel !== undefined)
    if (sel) {
      const l = toolbarLayout(sel, state.camera, vp)
      this.root.style.transform = `translate3d(${l.left}px, ${l.top}px, 0)`
    }
    if (setsEqual(hover, this.hover)) return
    this.buttons.forEach((b, action) => b.classList.toggle('is-hover', hover.has(action)))
    this.hover = new Set(hover)
  }

  destroy(): void {
    this.root.remove()
  }
}

const setsEqual = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean => a.size === b.size && [...a].every((x) => b.has(x))
