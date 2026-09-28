import { PALETTE } from '../board/model'
import { createCard } from './cards'
import type { Unsubscribe } from './emitter'
import { imageContent } from './image'
import { stickyFromText, type PocketContent, type PocketItem } from './model'
import type { Pocket } from './pocket'
import './prep-mode.css'

/**
 * Режим подготовки: карман управляется мышью и клавиатурой.
 * Ctrl+V вставляет картинку или текст, файл картинки можно бросить в окно, стикер вводится в поле.
 */

/** Размер плитки в сетке режима подготовки. */
export const PREP_TILE_PX = 96
/** Сколько держится сообщение о результате вставки. */
export const PREP_NOTE_MS = 2600

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] =>
  Object.assign(document.createElement(tag), { className, textContent: text })

/** Нажатия и колесо внутри панели не должны уходить эмулятору жестов на window. */
function isolate(node: HTMLElement): void {
  ;['pointerdown', 'pointerup', 'wheel', 'keydown'].forEach((type) => node.addEventListener(type, (e) => e.stopPropagation()))
}

const imageFiles = (list: FileList | readonly File[] | undefined | null): readonly File[] =>
  [...(list ?? [])].filter((f) => f.type.startsWith('image/'))

export class PrepMode {
  private readonly toggle: HTMLButtonElement
  private readonly panel: HTMLElement
  private readonly grid: HTMLElement
  private readonly note: HTMLElement
  private readonly input: HTMLInputElement
  private readonly disposers: Unsubscribe[] = []
  private noteTimer: ReturnType<typeof setTimeout> | undefined
  private colorIndex = 0

  constructor(host: HTMLElement, private readonly pocket: Pocket) {
    this.toggle = el('button', 'pk-prep-toggle', 'Подготовка')
    this.toggle.type = 'button'
    this.toggle.addEventListener('click', () => pocket.setPrepMode(!pocket.isPrepMode()))
    this.panel = el('section', 'pk-prep')
    this.grid = el('div', 'pk-prep-grid')
    this.note = el('div', 'pk-prep-note')
    this.input = el('input', 'pk-prep-input')
    this.panel.append(this.header(), this.grid, this.composer(), this.note)
    isolate(this.toggle)
    isolate(this.panel)
    host.append(this.toggle, this.panel)
    this.disposers.push(
      pocket.on('change', (items) => this.renderItems(items)),
      pocket.on('prep', ({ on }) => this.renderMode(on)),
      this.listen(document, 'paste', (e) => this.onPaste(e as ClipboardEvent)),
      this.listen(window, 'dragover', (e) => this.onDragOver(e as DragEvent)),
      this.listen(window, 'dragleave', () => this.panel.classList.remove('is-drop')),
      this.listen(window, 'drop', (e) => this.onDrop(e as DragEvent)),
    )
    this.renderItems(pocket.getItems())
    this.renderMode(pocket.isPrepMode())
  }

  destroy(): void {
    clearTimeout(this.noteTimer)
    this.disposers.splice(0).forEach((d) => d())
    this.toggle.remove()
    this.panel.remove()
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void): Unsubscribe {
    target.addEventListener(type, fn)
    return () => target.removeEventListener(type, fn)
  }

  private header(): HTMLElement {
    const head = el('header', 'pk-prep-head')
    const text = el('div', 'pk-prep-text')
    text.append(
      el('h2', 'pk-prep-title', 'Карман: подготовка'),
      el('p', 'pk-prep-help', 'Ctrl+V вставляет картинку или текст. Файл картинки можно перетащить сюда.'),
    )
    const reset = el('button', 'pk-prep-btn is-ghost', 'Вернуть заготовки')
    reset.type = 'button'
    reset.addEventListener('click', () => void this.pocket.reset())
    const done = el('button', 'pk-prep-btn', 'Готово')
    done.type = 'button'
    done.addEventListener('click', () => this.pocket.setPrepMode(false))
    head.append(text, reset, done)
    return head
  }

  private composer(): HTMLElement {
    const form = el('form', 'pk-prep-form')
    this.input.placeholder = 'Текст нового стикера'
    this.input.maxLength = 500
    const add = el('button', 'pk-prep-btn', 'Новый стикер')
    add.type = 'submit'
    form.append(this.input, add)
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const content = stickyFromText(this.input.value, this.nextColor())
      if (!content) {
        this.flash('Напиши текст стикера и нажми «Новый стикер»')
        this.input.focus()
        return
      }
      this.pocket.addPreset(content)
      this.input.value = ''
      this.flash('Стикер в кармане')
    })
    return form
  }

  private nextColor(): string | undefined {
    const list = PALETTE.sticky
    const color = list[this.colorIndex % list.length]
    this.colorIndex += 1
    return color
  }

  private renderMode(on: boolean): void {
    this.toggle.classList.toggle('is-on', on)
    this.toggle.setAttribute('aria-pressed', String(on))
    this.panel.classList.toggle('is-on', on)
    if (!on) this.panel.classList.remove('is-drop')
  }

  private renderItems(items: readonly PocketItem[]): void {
    const tiles = items.map((item) => this.tile(item))
    this.grid.replaceChildren(...tiles)
    if (!items.length) this.grid.append(el('div', 'pk-prep-empty', 'Карман пуст. Вставь картинку или напиши стикер.'))
  }

  private tile(item: PocketItem): HTMLElement {
    const card = createCard(item)
    card.classList.add('pk-prep-tile')
    card.style.setProperty('--pk-card', String(PREP_TILE_PX))
    const del = el('button', 'pk-prep-del', '×')
    del.type = 'button'
    del.title = item.type === 'preset' ? 'Удалить заготовку' : 'Убрать из кармана'
    del.setAttribute('aria-label', del.title)
    del.addEventListener('click', () => this.pocket.removeItem(item.id))
    card.append(del)
    return card
  }

  private onPaste(e: ClipboardEvent): void {
    if (!this.pocket.isPrepMode() || e.target === this.input) return
    const data = e.clipboardData
    if (!data) return
    const files = imageFiles(data.files.length ? data.files : [...data.items].flatMap((i) => i.getAsFile() ?? []))
    e.preventDefault()
    if (files.length) {
      void this.addImages(files)
      return
    }
    this.addContent(stickyFromText(data.getData('text/plain')), 'Скопируй картинку или текст, затем нажми Ctrl+V')
  }

  private onDragOver(e: DragEvent): void {
    if (!this.pocket.isPrepMode()) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    this.panel.classList.add('is-drop')
  }

  private onDrop(e: DragEvent): void {
    if (!this.pocket.isPrepMode()) return
    e.preventDefault()
    this.panel.classList.remove('is-drop')
    const files = imageFiles(e.dataTransfer?.files)
    if (files.length) {
      void this.addImages(files)
      return
    }
    this.addContent(stickyFromText(e.dataTransfer?.getData('text/plain') ?? ''), 'Перетащи файл картинки: PNG, JPG, SVG или GIF')
  }

  private addContent(content: PocketContent | undefined, help: string): void {
    if (!content) {
      this.flash(help)
      return
    }
    this.pocket.addPreset(content)
    this.flash('Заготовка в кармане')
  }

  private async addImages(files: readonly File[]): Promise<void> {
    const results = await Promise.allSettled(files.map((f) => imageContent(f)))
    const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    ok.forEach((content) => this.pocket.addPreset(content))
    const failed = results.length - ok.length
    this.flash(failed ? 'Часть файлов не открылась, попробуй PNG или JPG' : ok.length > 1 ? `Картинок в кармане: ${ok.length}` : 'Картинка в кармане')
  }

  private flash(text: string): void {
    this.note.textContent = text
    this.note.classList.add('is-on')
    clearTimeout(this.noteTimer)
    this.noteTimer = setTimeout(() => this.note.classList.remove('is-on'), PREP_NOTE_MS)
  }
}
