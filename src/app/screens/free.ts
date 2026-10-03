import { PALETTE } from '../../board'
import type { AppContext, ScreenHandle } from '../context'
import { el, isolate, text } from '../dom'
import { exportPng } from '../export'
import { createWorkspace, ensurePresets } from '../workspace'

/** Свободная доска: без таймера, весь функционал, режим подготовки кармана справа сверху. */

const NEW_STICKER_OFFSET = 36

export function mountFree(ctx: AppContext): ScreenHandle {
  const ws = createWorkspace({ host: ctx.boardHost, hub: ctx.hub, sound: ctx.sound, hints: ctx.hints }, { prep: true })
  void ensurePresets(ws.pocket)
  let added = 0
  const status = el('span', 'app-free-status')
  const sticker = ctx.buttons.create({
    label: 'Новый стикер',
    variant: 'small',
    onPress: () => {
      const cam = ws.board.getState().camera
      const k = (added % 5) - 2
      added += 1
      ws.board.addElement({
        kind: 'sticky',
        x: cam.x + k * NEW_STICKER_OFFSET,
        y: cam.y + k * NEW_STICKER_OFFSET,
        color: PALETTE.sticky[added % PALETTE.sticky.length],
      })
    },
  })
  const save = ctx.buttons.create({
    label: 'Сохранить PNG',
    variant: 'small',
    onPress: () => {
      exportPng(ws.board.getState())
        .then(() => (status.textContent = 'PNG сохранён'))
        .catch((err: unknown) => (status.textContent = err instanceof Error ? err.message : ''))
    },
  })
  const help = 'Кулак — взять, бросок — удалить, два пальца — двигать доску, палец на стикере — диктовать, карман внизу'
  const card = el(
    'div',
    'app-card app-free',
    el('div', 'app-free-text', text('div', 'app-ch-title', 'Свободная доска'), text('div', 'app-ch-task', help), status),
    sticker,
    save,
  )
  const screen = el('section', 'app-screen is-hud', isolate(card))
  ctx.layer.append(screen)
  return {
    destroy: () => {
      screen.remove()
      ws.destroy()
    },
  }
}
