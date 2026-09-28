import { createBoard, type Board } from '../board'
import { createPocket, type Pocket } from '../pocket'
import { createVoice, type Voice } from '../voice'
import { el, text } from './dom'
import type { HintToaster } from './hint-view'
import type { InputHub } from './input-hub'
import type { Sound } from './sound'
import type { WorldRect } from './zones'

/**
 * Рабочее место досочного экрана: доска, карман и голос на канале доски из хаба.
 * Создаётся заново для обучения, челленджа и свободной доски, чтобы у каждого была чистая история.
 * Отмена по Ctrl+Z не подключается: после «положить в карман» она возвращает дубль элемента.
 */

export interface Workspace {
  readonly board: Board
  readonly pocket: Pocket
  readonly voice: Voice
  destroy(): void
}

export interface WorkspaceDeps {
  readonly host: HTMLElement
  readonly hub: InputHub
  readonly sound: Sound
  readonly hints: HintToaster
}

export function createWorkspace(deps: WorkspaceDeps, opts: { readonly prep: boolean }): Workspace {
  const { hub, sound, hints } = deps
  const board = createBoard(deps.host, hub.board)
  const pocket = createPocket(board.layers.overlay, hub.board, board, { prepToggle: opts.prep })
  const voice = createVoice(board, hub.board)
  const offs = [
    board.on('hint', (h) => hints.offer(h)),
    board.on('grab', () => {
      hints.dismiss()
      sound.play('grab')
    }),
    board.on('drop', () => sound.play('drop')),
    board.on('throw', () => sound.play('throw')),
    pocket.on('put', () => {
      hints.dismiss()
      sound.play('pocket')
    }),
    pocket.on('take', () => hints.dismiss()),
  ]
  hub.setBoardOpen(true)
  return {
    board,
    pocket,
    voice,
    destroy: () => {
      hub.setBoardOpen(false)
      offs.forEach((off) => off())
      voice.destroy()
      pocket.destroy()
      board.destroy()
    },
  }
}

/** Заготовки нужны обучению и челленджу: если в кармане их нет, вернуть набор по умолчанию. */
export async function ensurePresets(pocket: Pocket): Promise<void> {
  await pocket.ready
  if (!pocket.getItems().some((i) => i.type === 'preset')) await pocket.reset()
}

export interface Decor {
  readonly rect: WorldRect
  readonly title: string
  readonly note?: string
  readonly tone: 'accent' | 'danger'
}

/** Подписанные рамки в мировом слое под элементами: двигаются и масштабируются вместе с доской. */
export function addDecor(board: Board, items: readonly Decor[]): () => void {
  const nodes = items.map((d) => {
    const node = el('div', `app-zone is-${d.tone}`, text('div', 'app-zone-title', d.title))
    if (d.note) node.append(text('div', 'app-zone-note', d.note))
    Object.assign(node.style, {
      left: `${d.rect.left}px`,
      top: `${d.rect.top}px`,
      width: `${d.rect.right - d.rect.left}px`,
      height: `${d.rect.bottom - d.rect.top}px`,
    })
    return node
  })
  board.layers.world.prepend(...nodes)
  return () => nodes.forEach((n) => n.remove())
}
