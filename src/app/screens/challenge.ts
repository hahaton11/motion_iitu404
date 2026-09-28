import { PALETTE } from '../../board'
import {
  CHALLENGE_HINTS,
  CHALLENGE_LIMIT_MS,
  CHALLENGE_TASK,
  CHALLENGE_TITLE,
  CLUSTERS,
  evaluate,
  fitZoom,
  formatTime,
  inTrash,
  nearMissCluster,
  progress,
  scoreOf,
  seedLayout,
  STICKER_SIZE,
  TIME_LOW_MS,
  timeLeft,
  TRASH,
  TRASH_NOTE,
  TRASH_TITLE,
} from '../challenge'
import type { AppContext, ScreenHandle } from '../context'
import { el, isolate, text } from '../dom'
import type { ExportZone } from '../export'
import { totalHints } from '../hint-layer'
import { addDecor, createWorkspace, ensurePresets, type Decor, type Workspace } from '../workspace'

/** Челлендж «Разбери брейншторм»: таймер сверху, зоны в мировом слое, проверка раскладки по разметке. */

const TICK_MS = 250
const FINISH_DELAY_MS = 700

export const CHALLENGE_DECOR: readonly Decor[] = [
  ...CLUSTERS.map((c): Decor => ({ rect: c.rect, title: c.title, tone: 'accent' })),
  { rect: TRASH, title: TRASH_TITLE, note: TRASH_NOTE, tone: 'danger' },
]

export const CHALLENGE_EXPORT_ZONES: readonly ExportZone[] = CHALLENGE_DECOR.map((d) => ({
  rect: d.rect,
  title: d.title,
  tone: d.tone,
}))

function seed(ws: Workspace): void {
  seedLayout().forEach((s) =>
    ws.board.addElement({
      id: s.id,
      kind: 'sticky',
      text: s.text,
      x: s.x,
      y: s.y,
      rotation: s.rotation,
      w: STICKER_SIZE,
      h: STICKER_SIZE,
      color: PALETTE.sticky[s.colorIndex],
    }),
  )
}

function fitCamera(ws: Workspace): void {
  ws.board.setCamera({ x: 0, y: 0, zoom: fitZoom(window.innerWidth, window.innerHeight) })
}

interface Hud {
  readonly node: HTMLElement
  readonly render: (leftMs: number) => void
}

function hud(ctx: AppContext, ws: Workspace, onDone: () => void): Hud {
  const timer = el('div', 'app-timer')
  const stats = el('div', 'app-ch-stats')
  const done = ctx.buttons.create({ label: 'Готово', icon: 'palm', variant: 'small', onPress: onDone })
  const node = el(
    'div',
    'app-card app-ch',
    el('div', 'app-ch-text', text('div', 'app-ch-title', CHALLENGE_TITLE), text('div', 'app-ch-task', CHALLENGE_TASK), stats),
    timer,
    done,
  )
  const render = (leftMs: number) => {
    const p = progress(ws.board.getState().elements)
    timer.textContent = formatTime(leftMs)
    timer.classList.toggle('is-low', leftMs <= TIME_LOW_MS)
    stats.textContent = `В зонах: ${p.inClusters} · убрано: ${p.removed} · новая идея: ${p.added ? 'есть' : 'нет'}`
  }
  return { node: isolate(node), render }
}

export function mountChallenge(ctx: AppContext): ScreenHandle {
  const ws = createWorkspace({ host: ctx.boardHost, hub: ctx.hub, sound: ctx.sound, hints: ctx.hints }, { prep: false })
  void ensurePresets(ws.pocket)
  fitCamera(ws)
  const removeDecor = addDecor(ws.board, CHALLENGE_DECOR)
  seed(ws)
  ctx.hints.resetStats()
  const messages: Record<string, string> = {}
  const startedAt = performance.now()
  let finished = false
  let lowWarned = false
  let finishTimer: ReturnType<typeof setTimeout> | undefined

  const finish = () => {
    if (finished) return
    finished = true
    const elapsedMs = Math.min(CHALLENGE_LIMIT_MS, performance.now() - startedAt)
    const state = ws.board.getState()
    const evaluation = evaluate(state.elements)
    const hintCounts = ctx.hints.counts()
    const score = scoreOf(evaluation.accuracy, elapsedMs, totalHints(hintCounts))
    ctx.setLastResult({
      evaluation,
      elapsedMs,
      hintCounts,
      hintMessages: { ...messages },
      score,
      state,
      zones: CHALLENGE_EXPORT_ZONES,
      finishedAt: Date.now(),
    })
    ctx.sound.play('final')
    ctx.send({ type: 'challengeDone' })
  }
  const bar = hud(ctx, ws, finish)
  const screen = el('section', 'app-screen is-hud', bar.node)
  ctx.layer.append(screen)

  const tick = () => {
    const left = timeLeft(performance.now() - startedAt)
    bar.render(left)
    if (!lowWarned && left <= TIME_LOW_MS) {
      lowWarned = true
      ctx.hints.offer(CHALLENGE_HINTS.TIME_LOW)
    }
    if (left <= 0) finish()
  }
  const onChange = () => {
    bar.render(timeLeft(performance.now() - startedAt))
    if (!finished && !finishTimer && evaluate(ws.board.getState().elements).perfect) {
      finishTimer = setTimeout(finish, FINISH_DELAY_MS)
    }
  }
  const offs = [
    ws.board.on('change', onChange),
    ws.board.on('hint', (h) => (messages[h.code] = h.message)),
    ctx.hub.raw.on('hint', (h) => (messages[h.code] = h.message)),
    ws.board.on('drop', ({ element }) => {
      if (inTrash(element)) {
        // Удаление после того, как доска закончит обработку отпускания.
        queueMicrotask(() => ws.board.removeElement(element.id))
        ctx.sound.play('throw')
      } else if (nearMissCluster(element)) ctx.hints.offer(CHALLENGE_HINTS.NEAR_MISS)
    }),
  ]
  const onResize = () => fitCamera(ws)
  window.addEventListener('resize', onResize)
  const interval = setInterval(tick, TICK_MS)
  tick()
  return {
    destroy: () => {
      clearInterval(interval)
      clearTimeout(finishTimer)
      window.removeEventListener('resize', onResize)
      offs.forEach((off) => off())
      removeDecor()
      screen.remove()
      ws.destroy()
    },
  }
}
