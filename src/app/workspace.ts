import { createBoard, type Board } from '../board'
import { createPocket, type Pocket } from '../pocket'
import { createVoice, speechSupported, type Voice } from '../voice'
import type { AppContext } from './context'
import { FocusInput } from './focus-input'
import { el, text } from './dom'
import type { HintToaster } from './hint-view'
import type { InputHub } from './input-hub'
import { voiceTip } from './permissions'
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
  /** Подсказка под стикером: как продиктовать текст или что включить для голоса. */
  readonly voiceTip?: () => string
}

/** Зависимости рабочего места из контекста приложения. */
export function workspaceDeps(ctx: AppContext): WorkspaceDeps {
  const speech = speechSupported()
  return {
    host: ctx.boardHost,
    hub: ctx.hub,
    sound: ctx.sound,
    hints: ctx.hints,
    voiceTip: () => voiceTip(ctx.micAccess(), ctx.flow().mode, speech),
  }
}

/** Рамки привязки каждой доски: к ним прилипает элемент при переносе взмахом. */
const decorRects = new WeakMap<Board, Set<WorldRect>>()

/** Управление фокусом и взмахами — экспериментальный режим, включается параметром ?nav=focus. */
export function focusNavEnabled(): boolean {
  return new URLSearchParams(location.search).get('nav') === 'focus'
}

export function createWorkspace(deps: WorkspaceDeps, opts: { readonly prep: boolean }): Workspace {
  const { hub, sound, hints } = deps
  const focus = focusNavEnabled() ? new FocusInput(hub.board) : undefined
  const input = focus ?? hub.board
  document.body.dataset.nav = focus ? 'focus' : 'cursor'
  const board = createBoard(deps.host, input)
  decorRects.set(board, new Set())
  const pocket = createPocket(board.layers.overlay, input, board, { prepToggle: opts.prep })
  focus?.attach({ board, overlay: board.layers.overlay, snapRects: () => [...(decorRects.get(board) ?? [])] })
  const voice = createVoice(board, input, deps.voiceTip ? { tip: deps.voiceTip } : {})
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
      focus?.stop()
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
  const rects = decorRects.get(board)
  items.forEach((d) => rects?.add(d.rect))
  return () => {
    nodes.forEach((n) => n.remove())
    items.forEach((d) => rects?.delete(d.rect))
  }
}
