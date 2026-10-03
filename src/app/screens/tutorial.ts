import { PALETTE } from '../../board'
import type { AppContext, ScreenHandle } from '../context'
import { el, icon, isolate } from '../dom'
import {
  currentStep,
  initialTutorial,
  panCentered,
  progressLabel,
  stepTutorial,
  TUTORIAL_FRAME,
  TUTORIAL_PAN_TARGET,
  TUTORIAL_STEPS,
  TUTORIAL_ZOOM_GOAL,
  TUTORIAL_ZOOM_TARGET,
  type TutorialEvent,
  type TutorialReaction,
  type TutorialState,
  type TutorialStepId,
} from '../tutorial'
import { addDecor, createWorkspace, ensurePresets, workspaceDeps, type Decor, type Workspace } from '../workspace'
import { centerIn, type WorldRect } from '../zones'

/** Обучение: семь шагов на настоящей доске с карманом. Карточка шага сверху, шаг пропускается ладонью. */

const RESPAWN_MS = 650
const FINISH_MS = 1400
const PRACTICE_ID = 'tut-practice'
/** grab от доски приходит раньше take кармана в том же стеке: такой grab не ошибка. */
const TAKE_GUARD_MS = 50
const PRACTICE_SIZE = 160
/**
 * Сколько камера должна стоять, чтобы считать движение законченным. Панорама и зум приходят
 * потоком кадров, и судить по каждому кадру нельзя: подсказка «веди дальше» вылетала бы
 * посреди движения, а шаг засчитывался бы на первом же кадре, попавшем в цель.
 */
const CAMERA_SETTLE_MS = 420

/** Что нарисовано на доске на каждом шаге. Зоны живут в мировом слое и едут вместе с доской. */
const STEP_DECOR: Readonly<Partial<Record<TutorialStepId, readonly Decor[]>>> = {
  move: [{ rect: TUTORIAL_FRAME, title: 'Рамка', note: 'опусти стикер сюда', tone: 'accent' }],
  pan: [{ rect: TUTORIAL_PAN_TARGET, title: 'Метка', note: 'приведи её в середину экрана', tone: 'accent' }],
  zoom: [
    {
      rect: TUTORIAL_ZOOM_TARGET,
      title: 'Табличка',
      note: 'Щипок вверх приближает доску, вниз — отдаляет. Масштаб растёт вокруг самого щипка',
      tone: 'accent',
      fine: true,
    },
  ],
}

const centerOfRect = (r: WorldRect) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 })

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
  const ws = createWorkspace(workspaceDeps(ctx), { prep: false })
  void ensurePresets(ws.pocket)
  let state = initialTutorial()
  let removeFrame: (() => void) | undefined
  let tookAt = -Infinity
  /** Камера, которую поставил сам экран: такое изменение — не действие человека. */
  let resetting = false
  let settle: ReturnType<typeof setTimeout> | undefined
  const timers: ReturnType<typeof setTimeout>[] = []
  const card = stepCard(ctx, () => dispatch({ type: 'skip' }))
  const screen = el('section', 'app-screen is-hud', card.node)
  ctx.layer.append(screen)

  /**
   * Каждый шаг начинается с доски в нуле: иначе учебный стикер появляется за краем экрана,
   * а цель шага панорамы оказывается уже в центре.
   */
  const resetCamera = () => {
    clearTimeout(settle)
    resetting = true
    ws.board.setCamera({ ...ws.board.getState().camera, x: 0, y: 0, zoom: 1 })
    resetting = false
  }

  /** Движение доски закончилось: шаг навигации смотрит, достигнута ли его цель. */
  const navDone = () => {
    const step = currentStep(state)
    if (step?.id === 'pan') dispatch({ type: 'panned', centered: panCentered(ws.board.toScreen(centerOfRect(TUTORIAL_PAN_TARGET))) })
    if (step?.id === 'zoom') dispatch({ type: 'zoomed', reached: ws.board.getState().camera.zoom >= TUTORIAL_ZOOM_GOAL })
  }

  const enterStep = () => {
    removeFrame?.()
    removeFrame = undefined
    resetCamera()
    const id = currentStep(state)?.id
    const decor = id ? STEP_DECOR[id] : undefined
    if (decor) removeFrame = addDecor(ws.board, decor)
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
  let camera = ws.board.getState().camera
  const offs = [
    // Панорама и зум не приходят отдельными событиями: доска показывает их камерой.
    ws.board.subscribe((s) => {
      if (resetting || s.camera === camera) return
      camera = s.camera
      const id = currentStep(state)?.id
      if (id !== 'pan' && id !== 'zoom') return
      clearTimeout(settle)
      settle = setTimeout(navDone, CAMERA_SETTLE_MS)
    }),
    ws.board.on('grab', () =>
      queueMicrotask(() => {
        if (performance.now() - tookAt > TAKE_GUARD_MS) dispatch({ type: 'grab' })
      }),
    ),
    ws.board.on('drop', ({ element }) => dispatch({ type: 'drop', inFrame: centerIn(TUTORIAL_FRAME, element) })),
    ws.board.on('throw', () => dispatch({ type: 'throw' })),
    ws.voice.on('end', () => dispatch({ type: 'dictated' })),
    // Без распознавания речи диктовка не начнётся: шаг засчитывается за сам жест выбора стикера.
    ws.board.on('select', ({ id }) => {
      if (id && !ws.voice.supported) dispatch({ type: 'dictated' })
    }),
    ws.pocket.on('put', () => dispatch({ type: 'put' })),
    ws.pocket.on('take', () => {
      tookAt = performance.now()
      dispatch({ type: 'take' })
    }),
  ]
  enterStep()
  return {
    destroy: () => {
      clearTimeout(settle)
      timers.forEach(clearTimeout)
      offs.forEach((off) => off())
      screen.remove()
      ws.destroy()
    },
  }
}
