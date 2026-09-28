import { createCard } from './cards'
import { POCKET_HEIGHT, type FanSlot, type Viewport } from './fan'
import type { PocketItem } from './model'
import './pocket.css'

/** Задержка между карточками при раскрытии веера. */
export const FAN_STAGGER_MS = 22
/** Длительность «глотка» кармана после того, как в него положили элемент. */
export const GULP_MS = 420

export interface PocketViewModel {
  readonly items: readonly PocketItem[]
  readonly slots: readonly FanSlot[]
  readonly viewport: Viewport
  readonly open: boolean
  /** Индексы карточек под прицелами. */
  readonly hot: ReadonlySet<number>
  /** Рука с элементом над карманом: отпусти — и он внутри. */
  readonly armed: boolean
  /** Рука с элементом у края кармана. */
  readonly near: boolean
  /** Пустая рука ждёт открытия. */
  readonly dwell: boolean
  readonly count: number
  readonly hidden: { readonly before: number; readonly after: number }
  readonly disabled: boolean
}

const div = (className: string, text = ''): HTMLElement =>
  Object.assign(document.createElement('div'), { className, textContent: text })

function labelFor(m: PocketViewModel): string {
  if (m.armed) return 'Отпусти — и элемент в кармане'
  if (m.open) return m.count ? 'Сомкни щипок над карточкой, чтобы достать' : 'Карман пуст, положи сюда элемент'
  if (m.near) return 'Ниже, к карману'
  return 'Задержи руку, чтобы открыть'
}

/**
 * DOM кармана. Задняя стенка лежит под элементами доски, передний край и веер — над ними,
 * поэтому элемент улетает «внутрь», за край. Анимируются только transform и opacity.
 */
export class PocketView {
  private readonly back: HTMLElement
  private readonly front: HTMLElement
  private readonly fan: HTMLElement
  private readonly label: HTMLElement
  private readonly badge: HTMLElement
  private readonly moreBefore: HTMLElement
  private readonly moreAfter: HTMLElement
  private readonly cards = new Map<string, HTMLElement>()
  private gulpTimer: ReturnType<typeof setTimeout> | undefined

  constructor(backHost: HTMLElement, backBefore: Node | null, frontHost: HTMLElement) {
    this.back = div('pk-back')
    this.back.append(div('pk-back-inner'))
    backHost.insertBefore(this.back, backBefore)
    this.fan = div('pk-fan')
    this.moreBefore = div('pk-more pk-more-before')
    this.moreAfter = div('pk-more pk-more-after')
    this.fan.append(this.moreBefore, this.moreAfter)
    this.front = div('pk-front')
    this.label = div('pk-label')
    this.badge = div('pk-badge', '0')
    const title = div('pk-title', 'Карман')
    this.front.append(div('pk-dwell'), title, this.badge, this.label)
    frontHost.append(this.fan, this.front)
  }

  render(m: PocketViewModel): void {
    const flags: Record<string, boolean> = {
      'is-open': m.open,
      'is-armed': m.armed,
      'is-near': m.near,
      'is-dwell': m.dwell && !m.open,
      'is-disabled': m.disabled,
    }
    for (const el of [this.back, this.front, this.fan]) {
      Object.entries(flags).forEach(([cls, on]) => el.classList.toggle(cls, on))
    }
    this.front.style.setProperty('--pk-h', `${m.viewport.h * POCKET_HEIGHT}px`)
    this.back.style.setProperty('--pk-h', `${m.viewport.h * POCKET_HEIGHT}px`)
    this.label.textContent = labelFor(m)
    this.badge.textContent = String(m.count)
    this.renderCards(m)
    this.renderMore(m)
  }

  /** Короткий «глоток»: карман вздрагивает, когда в него что-то положили. */
  gulp(): void {
    clearTimeout(this.gulpTimer)
    this.front.classList.remove('is-gulp')
    void this.front.offsetWidth
    this.front.classList.add('is-gulp')
    this.gulpTimer = setTimeout(() => this.front.classList.remove('is-gulp'), GULP_MS)
  }

  destroy(): void {
    clearTimeout(this.gulpTimer)
    this.back.remove()
    this.front.remove()
    this.fan.remove()
  }

  private renderCards(m: PocketViewModel): void {
    const ids = new Set(m.items.map((i) => i.id))
    this.cards.forEach((card, id) => {
      if (ids.has(id)) return
      card.remove()
      this.cards.delete(id)
    })
    m.items.forEach((item, i) => {
      const slot = m.slots[i]
      if (!slot) return
      const card = this.cards.get(item.id) ?? this.addCard(item, slot, m.viewport)
      this.placeCard(card, slot, i, m)
    })
  }

  private addCard(item: PocketItem, slot: FanSlot, vp: Viewport): HTMLElement {
    const card = createCard(item)
    this.placeAtMouth(card, slot, vp)
    this.fan.append(card)
    void card.offsetWidth
    this.cards.set(item.id, card)
    return card
  }

  private placeAtMouth(card: HTMLElement, slot: FanSlot, vp: Viewport): void {
    const s = card.style
    s.setProperty('--x', `${slot.cx - slot.size / 2}px`)
    s.setProperty('--y', `${vp.h - slot.size * 0.35}px`)
    s.setProperty('--r', '0deg')
  }

  private placeCard(card: HTMLElement, slot: FanSlot, i: number, m: PocketViewModel): void {
    const s = card.style
    s.width = `${slot.size}px`
    s.height = `${slot.size}px`
    s.setProperty('--pk-card', String(slot.size))
    card.classList.toggle('is-hot', m.open && m.hot.has(i))
    if (!m.open) {
      this.placeAtMouth(card, slot, m.viewport)
      s.transitionDelay = '0ms'
      return
    }
    s.setProperty('--x', `${slot.cx - slot.size / 2}px`)
    s.setProperty('--y', `${slot.cy - slot.size / 2}px`)
    s.setProperty('--r', `${slot.rotation}deg`)
    s.transitionDelay = card.classList.contains('is-shown') ? '0ms' : `${i * FAN_STAGGER_MS}ms`
    card.classList.add('is-shown')
  }

  private renderMore(m: PocketViewModel): void {
    const first = m.slots[0]
    const last = m.slots[m.slots.length - 1]
    this.more(this.moreBefore, m.open ? m.hidden.before : 0, first, -1)
    this.more(this.moreAfter, m.open ? m.hidden.after : 0, last, 1)
    if (!m.open) this.cards.forEach((c) => c.classList.remove('is-shown'))
  }

  private more(el: HTMLElement, n: number, slot: FanSlot | undefined, side: -1 | 1): void {
    el.classList.toggle('is-on', n > 0 && !!slot)
    if (!slot || n <= 0) return
    el.textContent = side < 0 ? `‹ ещё ${n}` : `ещё ${n} ›`
    el.style.setProperty('--x', `${slot.cx + side * (slot.size * 0.5 + 16)}px`)
    el.style.setProperty('--y', `${slot.cy}px`)
  }
}
