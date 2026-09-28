import type { Board } from '../board'
import type { InputSource } from '../contracts/input'
import { PocketController, type Pocket, type PocketOptions } from './pocket'
import { PrepMode } from './prep-mode'

export interface CreatePocketOptions extends PocketOptions {
  /** Показывать переключатель «Подготовка» в углу. По умолчанию true. */
  readonly prepToggle?: boolean
}

/**
 * Точка входа S3: карман у нижнего края доски и режим подготовки.
 * root — экранный слой поверх доски, обычно board.layers.overlay.
 * Задняя стенка кармана встаёт в board.layers.root под элементы доски.
 */
export function createPocket(root: HTMLElement, input: InputSource, board: Board, opts: CreatePocketOptions = {}): Pocket {
  const pocket = new PocketController(root, input, board, opts)
  const prep = opts.prepToggle === false ? undefined : new PrepMode(root, pocket)
  const destroy = pocket.destroy.bind(pocket)
  pocket.destroy = () => {
    prep?.destroy()
    destroy()
  }
  return pocket
}

export type { Pocket, PocketEventMap, PocketOptions } from './pocket'
export type { PocketContent, PocketItem, PocketItemType } from './model'
export type { PocketStore } from './storage'
export { memoryStore, openPocketStore } from './storage'
export { POCKET_HINTS } from './zone'
export { POCKET_HEIGHT } from './fan'
