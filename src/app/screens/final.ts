import { hintInfo, NO_MISTAKES } from '../advice'
import { formatTime } from '../challenge'
import type { AppContext, ChallengeResult, ScreenHandle } from '../context'
import { el, isolate, text } from '../dom'
import { canvasToBlob, downloadBlob, renderBoard } from '../export'
import { topHintCode, totalHints } from '../hint-layer'
import { DEFAULT_NAME, type GameRecord } from '../records'
import { recordsBlock } from './final-records'

/** Финал: итоговая доска, время, точность, подсказки, частая ошибка с советом, PNG, рекорды. */

function stat(label: string, value: string): HTMLElement {
  return el('div', 'app-stat', text('div', 'app-stat-value', value), text('div', 'app-stat-label', label))
}

function mistakeBlock(r: ChallengeResult): HTMLElement {
  const code = topHintCode(r.hintCounts)
  const info = code ? hintInfo(code, r.hintMessages[code]) : NO_MISTAKES
  const times = code ? ` · ${r.hintCounts[code]} раз` : ''
  return el(
    'div',
    'app-mistake',
    text('div', 'app-mistake-label', `Самая частая ошибка${times}`),
    text('div', 'app-mistake-title', info.label),
    text('div', 'app-mistake-advice', `Совет: ${info.advice}`),
  )
}

function preview(ctx: AppContext, r: ChallengeResult): HTMLElement {
  const img = el('img', 'app-final-img')
  img.alt = 'Итоговая доска'
  const status = el('p', 'app-caption')
  let canvas: HTMLCanvasElement | undefined
  renderBoard(r.state, r.zones)
    .then((c) => {
      canvas = c
      img.src = c.toDataURL('image/png')
    })
    .catch((err: unknown) => (status.textContent = err instanceof Error ? err.message : ''))
  const save = ctx.buttons.create({
    label: 'Сохранить PNG',
    variant: 'small',
    icon: 'palm',
    onPress: () => {
      if (!canvas) return
      canvasToBlob(canvas)
        .then((b) => {
          downloadBlob(b)
          status.textContent = 'PNG сохранён в загрузки'
        })
        .catch((err: unknown) => (status.textContent = err instanceof Error ? err.message : ''))
    },
  })
  return el('div', 'app-final-board', img, el('div', 'app-row', save), status)
}

function toRecord(r: ChallengeResult): GameRecord {
  return {
    id: `rec-${r.finishedAt.toString(36)}`,
    name: DEFAULT_NAME,
    score: r.score,
    accuracy: r.evaluation.accuracy,
    timeMs: Math.round(r.elapsedMs),
    hints: totalHints(r.hintCounts),
    at: r.finishedAt,
  }
}

export function mountFinal(ctx: AppContext): ScreenHandle {
  const r = ctx.lastResult()
  if (!r) {
    ctx.send({ type: 'again' })
    return { destroy: () => undefined }
  }
  const e = r.evaluation
  const records = recordsBlock(ctx, toRecord(r))
  const again = ctx.buttons.create({ label: 'Ещё раз', icon: 'palm', onPress: () => ctx.send({ type: 'again' }) })
  const free = ctx.buttons.create({ label: 'Свободная доска', variant: 'ghost', onPress: () => ctx.send({ type: 'free' }) })
  const headline = e.perfect ? 'Идеально разобрано!' : e.accuracy >= 70 ? 'Хорошая раскладка' : 'Брейншторм разобран'
  const summary = `По зонам ${e.placed} из 9, лишних убрано ${e.discarded} из 3, новая идея ${e.added ? 'добавлена' : 'не добавлена'}`
  const stats = el(
    'div',
    'app-stats',
    stat('время', formatTime(r.elapsedMs)),
    stat('точность', `${e.accuracy}%`),
    stat('подсказок', String(totalHints(r.hintCounts))),
    stat('очков', String(r.score)),
  )
  const info = el('div', 'app-final-info', text('h2', 'app-title', headline), text('p', 'app-caption', summary), stats, mistakeBlock(r), records.node)
  const card = el('div', 'app-card app-final', el('div', 'app-final-grid', preview(ctx, r), info), el('div', 'app-row app-final-actions', again, free))
  const screen = el('section', 'app-screen is-full is-final', isolate(card))
  ctx.layer.append(screen)
  return {
    destroy: () => {
      records.destroy()
      screen.remove()
    },
  }
}
