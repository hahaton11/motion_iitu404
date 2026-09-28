import type { BoardElement, ElementKind, NewElement } from '../board'
import { ELEMENT_KINDS } from '../board/model'

/**
 * Модель кармана. Два типа содержимого:
 * preset — заготовка с замком, при извлечении достаётся копия, сама заготовка остаётся;
 * stash — убранное с доски, достаётся сам элемент и уходит из кармана.
 */
export type PocketItemType = 'preset' | 'stash'

/** То, из чего на доске создаётся элемент: всё, кроме id, позиции и слоя. */
export interface PocketContent {
  readonly kind: ElementKind
  readonly w?: number
  readonly h?: number
  readonly color?: string
  readonly text?: string
  readonly src?: string
  readonly rotation?: number
}

export interface PocketItem {
  readonly id: string
  readonly type: PocketItemType
  readonly content: PocketContent
  readonly createdAt: number
}

/** offset — индекс первого видимого элемента веера. */
export interface PocketState {
  readonly items: readonly PocketItem[]
  readonly offset: number
}

export interface TakeResult {
  readonly state: PocketState
  readonly item: PocketItem
  readonly spec: NewElement
}

/** Видно одновременно столько элементов веера. */
export const FAN_VISIBLE = 7
/** Предел текста стикера и размера dataURL картинки при загрузке из хранилища. */
export const MAX_TEXT_LENGTH = 500
export const MAX_SRC_LENGTH = 8_000_000
const MAX_SIZE = 2000

export const emptyPocket = (): PocketState => ({ items: [], offset: 0 })

const maxOffset = (count: number, visible: number): number => Math.max(0, count - visible)

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

const withItems = (s: PocketState, items: readonly PocketItem[], visible = FAN_VISIBLE): PocketState => ({
  items,
  offset: clamp(s.offset, 0, maxOffset(items.length, visible)),
})

/** Новые элементы встают в начало веера. */
export function addItem(s: PocketState, item: PocketItem): PocketState {
  return { items: [item, ...s.items.filter((i) => i.id !== item.id)], offset: 0 }
}

export function removeItem(s: PocketState, id: string, visible = FAN_VISIBLE): PocketState {
  return s.items.some((i) => i.id === id) ? withItems(s, s.items.filter((i) => i.id !== id), visible) : s
}

export function setItems(s: PocketState, items: readonly PocketItem[], visible = FAN_VISIBLE): PocketState {
  return withItems(s, items, visible)
}

/** Сдвиг веера на delta элементов с упором в края. */
export function scrollBy(s: PocketState, delta: number, visible = FAN_VISIBLE): PocketState {
  const offset = clamp(s.offset + delta, 0, maxOffset(s.items.length, visible))
  return offset === s.offset ? s : { ...s, offset }
}

export function visibleItems(s: PocketState, visible = FAN_VISIBLE): readonly PocketItem[] {
  return s.items.slice(s.offset, s.offset + visible)
}

/** Сколько элементов спрятано слева и справа от видимой части веера. */
export function hiddenCounts(s: PocketState, visible = FAN_VISIBLE): { readonly before: number; readonly after: number } {
  return { before: s.offset, after: Math.max(0, s.items.length - s.offset - visible) }
}

export const toSpec = (content: PocketContent): NewElement => ({ ...content })

/** Достать элемент: заготовка остаётся в кармане, убранное уходит. */
export function takeItem(s: PocketState, id: string, visible = FAN_VISIBLE): TakeResult | undefined {
  const item = s.items.find((i) => i.id === id)
  if (!item) return undefined
  const state = item.type === 'preset' ? s : removeItem(s, id, visible)
  return { state, item, spec: toSpec(item.content) }
}

/** Содержимое элемента доски без id, позиции и слоя. */
export function contentOf(el: BoardElement): PocketContent {
  const base: PocketContent = { kind: el.kind, w: el.w, h: el.h, color: el.color, rotation: el.rotation }
  return {
    ...base,
    ...(el.text !== undefined ? { text: el.text } : {}),
    ...(el.src !== undefined ? { src: el.src } : {}),
  }
}

export const makeItem = (id: string, type: PocketItemType, content: PocketContent, now: number): PocketItem => ({
  id,
  type,
  content,
  createdAt: now,
})

export const stashElement = (el: BoardElement, id: string, now: number): PocketItem =>
  makeItem(id, 'stash', contentOf(el), now)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const optNum = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : undefined

const optStr = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.length <= max ? v : undefined

const SAFE_SRC = /^(data:image\/|blob:|\.\/|\/|https?:\/\/)/

/** Проверка содержимого из недоверенного источника: хранилище, буфер обмена. */
export function parseContent(raw: unknown): PocketContent | undefined {
  if (!isObj(raw) || !ELEMENT_KINDS.includes(raw.kind as ElementKind)) return undefined
  const src = optStr(raw.src, MAX_SRC_LENGTH)
  if (raw.kind === 'image' && (!src || !SAFE_SRC.test(src))) return undefined
  const fields: Record<string, unknown> = {
    w: optNum(raw.w, 1, MAX_SIZE),
    h: optNum(raw.h, 1, MAX_SIZE),
    color: optStr(raw.color, 32),
    text: optStr(raw.text, MAX_TEXT_LENGTH),
    src: raw.kind === 'image' ? src : undefined,
    rotation: optNum(raw.rotation, -360, 360),
  }
  const defined = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
  return { kind: raw.kind as ElementKind, ...defined }
}

export function parseItem(raw: unknown): PocketItem | undefined {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return undefined
  if (raw.type !== 'preset' && raw.type !== 'stash') return undefined
  const content = parseContent(raw.content)
  if (!content) return undefined
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : 0
  return makeItem(raw.id, raw.type, content, createdAt)
}

/** Порядок в веере: новые первыми. */
export const sortItems = (items: readonly PocketItem[]): readonly PocketItem[] =>
  [...items].sort((a, b) => b.createdAt - a.createdAt)
