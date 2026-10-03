import type { HandId } from '../contracts/input'
import { emptyState, type BoardElement, type BoardState, type Camera, type ElementPatch } from './model'

export const HISTORY_LIMIT = 50
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 4

/** pan: dx, dy в пикселях экрана. zoom: ox, oy — точка опоры в пикселях от центра экрана. */
export type BoardAction =
  | { readonly type: 'add'; readonly element: BoardElement }
  | { readonly type: 'remove'; readonly id: string }
  | { readonly type: 'update'; readonly id: string; readonly patch: ElementPatch }
  | { readonly type: 'move'; readonly id: string; readonly x: number; readonly y: number }
  | { readonly type: 'duplicate'; readonly id: string; readonly newId: string; readonly dx: number; readonly dy: number }
  | { readonly type: 'select'; readonly id?: string }
  | { readonly type: 'bringToFront'; readonly id: string }
  | { readonly type: 'grab'; readonly hand: HandId; readonly id: string; readonly dx: number; readonly dy: number }
  | { readonly type: 'dragTo'; readonly x: number; readonly y: number }
  | { readonly type: 'release' }
  | { readonly type: 'pan'; readonly dx: number; readonly dy: number }
  | { readonly type: 'zoom'; readonly factor: number; readonly ox: number; readonly oy: number }
  | { readonly type: 'setCamera'; readonly camera: Camera }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }

type Snapshot = readonly BoardElement[]

export interface BoardStore {
  readonly state: BoardState
  readonly past: readonly Snapshot[]
  readonly future: readonly Snapshot[]
}

/** Действия, которые пишутся в историю undo. grab пишется всегда: весь перенос — один шаг. */
const RECORDED: ReadonlySet<BoardAction['type']> = new Set(['add', 'remove', 'update', 'move', 'duplicate', 'grab'])

export const createStore = (state: BoardState = emptyState()): BoardStore => ({ state, past: [], future: [] })

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const topZ = (els: Snapshot): number => els.reduce((m, e) => Math.max(m, e.z), 0)

function patchElement(state: BoardState, id: string, patch: ElementPatch): BoardState {
  if (!state.elements.some((e) => e.id === id)) return state
  return { ...state, elements: state.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }
}

function removeElement(state: BoardState, id: string): BoardState {
  if (!state.elements.some((e) => e.id === id)) return state
  const { held, selectedId, ...rest } = state
  return {
    ...rest,
    elements: state.elements.filter((e) => e.id !== id),
    ...(held && held.id !== id ? { held } : {}),
    ...(selectedId && selectedId !== id ? { selectedId } : {}),
  }
}

function bringToFront(state: BoardState, id: string): BoardState {
  const target = state.elements.find((e) => e.id === id)
  if (!target) return state
  const others = state.elements.filter((e) => e.id !== id)
  if (others.every((e) => e.z < target.z)) return state
  return patchElement(state, id, { z: topZ(state.elements) + 1 })
}

function duplicate(state: BoardState, a: Extract<BoardAction, { type: 'duplicate' }>): BoardState {
  const src = state.elements.find((e) => e.id === a.id)
  if (!src) return state
  const copy = { ...src, id: a.newId, x: src.x + a.dx, y: src.y + a.dy, z: topZ(state.elements) + 1 }
  return { ...state, elements: [...state.elements, copy], selectedId: a.newId }
}

function grab(state: BoardState, a: Extract<BoardAction, { type: 'grab' }>): BoardState {
  if (!state.elements.some((e) => e.id === a.id)) return state
  return { ...bringToFront(state, a.id), held: { hand: a.hand, id: a.id, dx: a.dx, dy: a.dy } }
}

function zoom(state: BoardState, a: Extract<BoardAction, { type: 'zoom' }>): BoardState {
  const cam = state.camera
  const next = clamp(cam.zoom * a.factor, ZOOM_MIN, ZOOM_MAX)
  if (next === cam.zoom) return state
  const wx = a.ox / cam.zoom + cam.x
  const wy = a.oy / cam.zoom + cam.y
  return { ...state, camera: { x: wx - a.ox / next, y: wy - a.oy / next, zoom: next } }
}

function withoutKey<K extends 'held' | 'selectedId'>(state: BoardState, key: K): BoardState {
  if (state[key] === undefined) return state
  const copy = { ...state }
  delete copy[key]
  return copy
}

/** Чистый редьюсер состояния доски без истории. */
export function reduce(state: BoardState, a: BoardAction): BoardState {
  switch (a.type) {
    case 'add':
      return { ...state, elements: [...state.elements, { ...a.element, z: topZ(state.elements) + 1 }] }
    case 'remove':
      return removeElement(state, a.id)
    case 'update':
      return patchElement(state, a.id, a.patch)
    case 'move':
      return patchElement(state, a.id, { x: a.x, y: a.y })
    case 'duplicate':
      return duplicate(state, a)
    case 'select':
      return a.id === undefined ? withoutKey(state, 'selectedId') : { ...state, selectedId: a.id }
    case 'bringToFront':
      return bringToFront(state, a.id)
    case 'grab':
      return grab(state, a)
    case 'dragTo':
      return state.held ? patchElement(state, state.held.id, { x: a.x + state.held.dx, y: a.y + state.held.dy }) : state
    case 'release':
      return withoutKey(state, 'held')
    case 'pan': {
      const c = state.camera
      return { ...state, camera: { ...c, x: c.x - a.dx / c.zoom, y: c.y - a.dy / c.zoom } }
    }
    case 'zoom':
      return zoom(state, a)
    /*
     * Наклон — свойство сцены, а не того, куда смотрит камера, поэтому он переживает установку
     * камеры: вызов без `tilt` его сохраняет, а не роняет в ноль. Так челлендж и кнопка «к центру»
     * расплющивали доску, и объём оставался только там, где камеру никто не трогал.
     */
    case 'setCamera':
      return {
        ...state,
        camera: { tilt: state.camera.tilt, ...a.camera, zoom: clamp(a.camera.zoom, ZOOM_MIN, ZOOM_MAX) },
      }
    case 'undo':
    case 'redo':
      return state
  }
}

function restore(state: BoardState, elements: Snapshot): BoardState {
  const exists = state.selectedId !== undefined && elements.some((e) => e.id === state.selectedId)
  const next = { ...state, elements }
  return exists ? next : withoutKey(next, 'selectedId')
}

function undo(store: BoardStore): BoardStore {
  const prev = store.past[store.past.length - 1]
  if (!prev || store.state.held) return store
  return {
    state: restore(store.state, prev),
    past: store.past.slice(0, -1),
    future: [store.state.elements, ...store.future],
  }
}

function redo(store: BoardStore): BoardStore {
  const [next, ...rest] = store.future
  if (!next || store.state.held) return store
  return { state: restore(store.state, next), past: [...store.past, store.state.elements], future: rest }
}

/** Применяет действие и ведёт историю элементов. Камера и выделение в историю не попадают. */
export function dispatch(store: BoardStore, a: BoardAction): BoardStore {
  if (a.type === 'undo') return undo(store)
  if (a.type === 'redo') return redo(store)
  const state = reduce(store.state, a)
  if (state === store.state) return store
  const changed = state.elements !== store.state.elements || a.type === 'grab'
  if (!RECORDED.has(a.type) || !changed) return { ...store, state }
  return { state, past: [...store.past, store.state.elements].slice(-HISTORY_LIMIT), future: [] }
}
