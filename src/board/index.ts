import type { InputSource } from '../contracts/input'
import { createBoardApi, type Board } from './api'
import './theme.css'

/** Точка входа S2: доска на весь экран внутри root, управляемая любым InputSource. */
export function createBoard(root: HTMLElement, input: InputSource): Board {
  return createBoardApi(root, input)
}

export type { AddOptions, Board, BoardEventMap, BoardLayers, NewElement, ReleaseInfo, RemoveOptions } from './api'
export type { BoardElement, BoardState, Camera, ElementKind, ElementPatch, Held } from './model'
export { ELEMENT_KINDS, PALETTE } from './model'
export { BOARD_HINTS } from './controller'
