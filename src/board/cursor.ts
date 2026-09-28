import type { HandId } from '../contracts/input'
import type { HandState } from './controller'

/** Прицел уменьшается при сжатии кулака: scale(1 - closure * CLOSURE_SHRINK). */
export const CLOSURE_SHRINK = 0.4

/**
 * Прицел-горошина для каждой руки в экранных координатах.
 * Магнитный фокус: элемент рядом с рукой подсвечивает контур, а прицел почти исчезает.
 * Над кнопкой плашки вокруг точки появляется кольцо.
 * Пока рука держит элемент, прицел скрыт: за рукой следует сам элемент.
 */
export class CursorLayer {
  private readonly dots = new Map<HandId, HTMLElement>()

  constructor(private readonly overlay: HTMLElement) {}

  update(hands: Partial<Record<HandId, HandState>>, holdingHand: HandId | undefined): void {
    const present = new Set<HandId>()
    for (const [hand, h] of Object.entries(hands) as [HandId, HandState | undefined][]) {
      if (!h) continue
      present.add(hand)
      this.place(this.dot(hand), h, hand === holdingHand)
    }
    this.dots.forEach((dot, hand) => {
      if (present.has(hand)) return
      dot.remove()
      this.dots.delete(hand)
    })
  }

  destroy(): void {
    this.dots.forEach((d) => d.remove())
    this.dots.clear()
  }

  private dot(hand: HandId): HTMLElement {
    const existing = this.dots.get(hand)
    if (existing) return existing
    const dot = Object.assign(document.createElement('div'), { className: 'mb-cursor' })
    dot.dataset.hand = hand
    this.overlay.append(dot)
    this.dots.set(hand, dot)
    return dot
  }

  private place(dot: HTMLElement, h: HandState, holding: boolean): void {
    const scale = 1 - Math.min(1, Math.max(0, h.closure)) * CLOSURE_SHRINK
    dot.style.transform = `translate3d(${h.x}px, ${h.y}px, 0) scale(${scale})`
    dot.classList.toggle('is-hidden', holding)
    // Элемент в фокусе подсвечивается сам, прицел над ним почти исчезает, чтобы не мешать.
    dot.classList.toggle('is-focus', !holding && h.hoverId !== undefined)
    dot.classList.toggle('is-over', !holding && h.hoverAction !== undefined)
  }
}
