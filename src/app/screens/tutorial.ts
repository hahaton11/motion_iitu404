import { PALETTE } from '../../board'
import type { AppContext, ScreenHandle } from '../context'
import { el, icon, isolate } from '../dom'
import {
  currentStep,
  initialTutorial,
  progressLabel,
  stepTutorial,
  TUTORIAL_FRAME,
  TUTORIAL_STEPS,
  type TutorialEvent,
  type TutorialReaction,
  type TutorialState,
} from '../tutorial'
import { addDecor, createWorkspace, ensurePresets, type Workspace } from '../workspace'
import { centerIn } from '../zones'

/** Обучение: четыре шага на настоящей доске с карманом. Карточка шага сверху, шаг пропускается кнопкой. */

const RESPAWN_MS = 650
const FINISH_MS = 1400
const PRACTICE_ID = 'tut-practice'
/** grab от доски приходит раньше take кармана в том же стеке: такой grab не ошибка. */
const TAKE_GUARD_MS = 50
const PRACTICE_SIZE = 160

interface Card {
  readonly node: HTMLElement
  readonly render: (s: TutorialState, done: boolean) => void
}

function stepCard(ctx: AppContext, onSkip: () => void): Card {
  const progress = el('div', 'app-tut-progress')
  const iconSlot = el('div', 'app-tut-icon')
  const title = el('h2', 'app-tut-title')
  const instruction = el('p', 'app-tut-text')
  const note = el('p', 'app-tut-note')
  const skip = ctx.buttons.create({ label: 'Пропустить шаг', variant: 'small', onPress: onSkip })
  const dots = el('div', 'app-tut-dots', ...TUTORIAL_STEPS.map(() => el('span')))
  const body = el('div', 'app-tut-body', title, instruction, note)
  const node = el('div', 'app-card app-tut', el('div', 'app-tut-head', progress, dots), el('div', 'app-tut-main', iconSlot, body), skip)
  const render = (s: TutorialState, done: boolean) => {
    const step = currentStep(s)
    ;[...dots.children].forEach((d, i) => d.classList.toggle('is-done', i < s.index || done))
    node.classList.toggle('is-done', done)
    progress.textContent = done ? 'Обучение пройдено' : progressLabel(s)
    title.textContent = done ? 'Отлично, ты готов' : (step?.title ?? '')
    instruction.textContent = done ? 'Дальше челлендж: разбери брейншторм на время' : (step?.instruction ?? '')
    note.textContent = done ? '' : (step?.note ?? '')
    iconSlot.replaceChildren(icon(done ? 'palm' : (step?.icon ?? 'hand')))
    skip.hidden = done
  }
  return { node: isolate(node), render }
}

function spawnPractice(ws: Workspace, s: TutorialState): void {
  const step = currentStep(s)
  if (!step?.spawn || ws.board.getElement(PRACTICE_ID)) return
  if (step.id === 'put' && ws.board.getState().elements.length > 0) return
  ws.board.addElement({
    id: PRACTICE_ID,
    kind: 'sticky',
    text: step.spawnText ?? '',
    x: step.spawn.x,
    y: step.spawn.y,
    color: PALETTE.sticky[s.index % PALETTE.sticky.length],
    w: PRACTICE_SIZE,
    h: PRACTICE_SIZE,
  })
}

export function mountTutorial(ctx: AppContext): ScreenHandle {
  const ws = createWorkspace({ host: ctx.boardHost, hub: ctx.hub, sound: ctx.sound, hints: ctx.hints }, { prep: false })
  void ensurePresets(ws.pocket)
  let state = initialTutorial()
  let removeFrame: (() => void) | undefined
  let tookAt = -Infinity
  const timers: ReturnType<typeof setTimeout>[] = []
  const card = stepCard(ctx, () => dispatch({ type: 'skip' }))
  const screen = el('section', 'app-screen is-hud', card.node)
  ctx.layer.append(screen)

  const enterStep = () => {
    removeFrame?.()
    removeFrame = undefined
    if (currentStep(state)?.id === 'move') {
      removeFrame = addDecor(ws.board, [{ rect: TUTORIAL_FRAME, title: 'Рамка', note: 'опусти стикер сюда', tone: 'accent' }])
    }
    spawnPractice(ws, state)
    card.render(state, false)
  }
  const react = (r: TutorialReaction, prevIndex: number) => {
    if (r.kind === 'hint') {
      ctx.hints.offer(r.hint)
      if (r.respawn) timers.push(setTimeout(() => spawnPractice(ws, state), RESPAWN_MS))
      return
    }
    if (r.kind === 'none') return
    ctx.hints.dismiss()
    ctx.sound.play('step')
    if (TUTORIAL_STEPS[prevIndex]?.id === 'move') ws.board.removeElement(PRACTICE_ID)
    if (r.kind === 'advance') return enterStep()
    removeFrame?.()
    card.render(state, true)
    timers.push(setTimeout(() => ctx.send({ type: 'tutorialDone' }), FINISH_MS))
  }
  const dispatch = (e: TutorialEvent) => {
    const prev = state.index
    const r = stepTutorial(state, e)
    state = r.state
    react(r.reaction, prev)
  }
  const offs = [
    ws.board.on('grab', () =>
      queueMicrotask(() => {
        if (performance.now() - tookAt > TAKE_GUARD_MS) dispatch({ type: 'grab' })
      }),
    ),
    ws.board.on('drop', ({ element }) => dispatch({ type: 'drop', inFrame: centerIn(TUTORIAL_FRAME, element) })),
    ws.board.on('throw', () => dispatch({ type: 'throw' })),
    ws.pocket.on('put', () => dispatch({ type: 'put' })),
    ws.pocket.on('take', () => {
      tookAt = performance.now()
      dispatch({ type: 'take' })
    }),
  ]
  enterStep()
  return {
    destroy: () => {
      timers.forEach(clearTimeout)
      offs.forEach((off) => off())
      screen.remove()
      ws.destroy()
    },
  }
}
