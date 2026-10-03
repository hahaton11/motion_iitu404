import type { HintEvt } from '../contracts/input'
import { rect, type WorldPoint, type WorldRect } from './zones'

/**
 * Обучение из четырёх шагов. Каждый шаг ждёт правильного действия, на ошибку отвечает подсказкой.
 * Чистый редьюсер: события доски и кармана приходят снаружи, реакция возвращается экрану.
 */

export type TutorialStepId = 'move' | 'throw' | 'take' | 'put'

/** Иконка жеста для карточки шага и подсказки. */
export type GestureIcon = 'fist' | 'palm' | 'throw' | 'point' | 'victory' | 'pocket' | 'voice' | 'hand' | 'light'

export interface TutorialStep {
  readonly id: TutorialStepId
  readonly title: string
  readonly instruction: string
  /** Дополнительная строка под инструкцией. */
  readonly note: string
  readonly icon: GestureIcon
  /** Где появляется учебный стикер. undefined — шаг без своего стикера. */
  readonly spawn?: WorldPoint
  readonly spawnText?: string
}

/** Рамка для первого шага, мировые координаты при камере в нуле. */
export const TUTORIAL_FRAME: WorldRect = rect(120, -170, 440, 110)

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'move',
    title: 'Возьми и перенеси',
    instruction: 'Сожми кулак или щипок на сообщении, перенеси его в рамку справа и раскрой ладонь',
    note: 'Под сообщением появится тень — значит оно у тебя в руке',
    icon: 'fist',
    spawn: { x: -300, y: -30 },
    spawnText: 'Перенеси меня в рамку',
  },
  {
    id: 'throw',
    title: 'Выброси в шлюз',
    instruction: 'Возьми сообщение и резко махни рукой в сторону, раскрывая ладонь на ходу',
    note: 'Резкий бросок удаляет. Чтобы сохранить, опусти в карман внизу без броска',
    icon: 'throw',
    spawn: { x: -40, y: -30 },
    spawnText: 'Выброси меня',
  },
  {
    id: 'take',
    title: 'Достань из кармана',
    instruction: 'Задержи открытую ладонь над карманом внизу, затем сожми кулак над карточкой',
    note: 'Заготовки с замком не кончаются, достаётся копия',
    icon: 'pocket',
  },
  {
    id: 'put',
    title: 'Убери в карман',
    instruction: 'Опусти сообщение в карман внизу и раскрой ладонь, не бросая',
    note: 'Карман запоминает содержимое и после перезагрузки',
    icon: 'palm',
    spawn: { x: -40, y: -30 },
    spawnText: 'Положи меня в карман',
  },
]

export const TUTORIAL_HINTS = {
  DROP_IN_FRAME: { code: 'TUT_DROP_IN_FRAME', message: 'Отпусти стикер внутри рамки справа', severity: 'info' },
  NO_THROW: { code: 'TUT_NO_THROW', message: 'Веди стикер плавно: резкий бросок удаляет его', severity: 'warn' },
  KEEP_ON_BOARD: { code: 'TUT_KEEP_ON_BOARD', message: 'Перенеси стикер в рамку, а не в карман', severity: 'info' },
  THROW_FASTER: { code: 'TUT_THROW_FASTER', message: 'Махни рукой резче и раскрой ладонь на ходу', severity: 'warn' },
  THROW_NOT_POCKET: { code: 'TUT_THROW_NOT_POCKET', message: 'Брось стикер в сторону: над карманом он сохраняется', severity: 'info' },
  OPEN_POCKET: { code: 'TUT_OPEN_POCKET', message: 'Задержи открытую ладонь над карманом внизу, чтобы он открылся', severity: 'info' },
  PUT_NO_THROW: { code: 'TUT_PUT_NO_THROW', message: 'Не бросай: опусти элемент в карман и раскрой ладонь', severity: 'warn' },
  PUT_LOWER: { code: 'TUT_PUT_LOWER', message: 'Опусти элемент ниже, в карман внизу экрана', severity: 'info' },
} as const satisfies Record<string, HintEvt>

export type TutorialEvent =
  | { readonly type: 'grab' }
  /** Элемент отпущен на доске. inFrame — центр в рамке первого шага. */
  | { readonly type: 'drop'; readonly inFrame: boolean }
  | { readonly type: 'throw' }
  | { readonly type: 'put' }
  | { readonly type: 'take' }
  | { readonly type: 'skip' }

export interface TutorialState {
  readonly index: number
  readonly done: boolean
  /** Ошибки на текущем шаге. */
  readonly mistakes: number
}

export type TutorialReaction =
  | { readonly kind: 'none' }
  | { readonly kind: 'advance' }
  | { readonly kind: 'finish' }
  /** respawn — учебный стикер пропал с доски, его нужно вернуть. */
  | { readonly kind: 'hint'; readonly hint: HintEvt; readonly respawn: boolean }

export interface TutorialResult {
  readonly state: TutorialState
  readonly reaction: TutorialReaction
}

export const initialTutorial = (): TutorialState => ({ index: 0, done: false, mistakes: 0 })

export const currentStep = (s: TutorialState): TutorialStep | undefined => TUTORIAL_STEPS[s.index]

const NONE: TutorialReaction = { kind: 'none' }

const hint = (h: HintEvt, respawn = false): TutorialReaction => ({ kind: 'hint', hint: h, respawn })

type Rules = Readonly<Partial<Record<TutorialEvent['type'], TutorialReaction | 'ok'>>>

/** Для каждого шага: какое событие проходит шаг, какое вызывает подсказку. */
const RULES: Readonly<Record<TutorialStepId, Rules>> = {
  move: { throw: hint(TUTORIAL_HINTS.NO_THROW, true), put: hint(TUTORIAL_HINTS.KEEP_ON_BOARD, true) },
  throw: { throw: 'ok', drop: hint(TUTORIAL_HINTS.THROW_FASTER), put: hint(TUTORIAL_HINTS.THROW_NOT_POCKET, true) },
  take: { take: 'ok', grab: hint(TUTORIAL_HINTS.OPEN_POCKET) },
  put: { put: 'ok', throw: hint(TUTORIAL_HINTS.PUT_NO_THROW, true), drop: hint(TUTORIAL_HINTS.PUT_LOWER) },
}

function ruleFor(step: TutorialStep, e: TutorialEvent): TutorialReaction | 'ok' {
  if (e.type === 'skip') return 'ok'
  if (step.id === 'move' && e.type === 'drop') return e.inFrame ? 'ok' : hint(TUTORIAL_HINTS.DROP_IN_FRAME)
  return RULES[step.id][e.type] ?? NONE
}

export function stepTutorial(s: TutorialState, e: TutorialEvent): TutorialResult {
  const step = currentStep(s)
  if (s.done || !step) return { state: s, reaction: NONE }
  const rule = ruleFor(step, e)
  if (rule === 'ok') {
    const index = s.index + 1
    const done = index >= TUTORIAL_STEPS.length
    return { state: { index, done, mistakes: 0 }, reaction: { kind: done ? 'finish' : 'advance' } }
  }
  if (rule.kind === 'hint') return { state: { ...s, mistakes: s.mistakes + 1 }, reaction: rule }
  return { state: s, reaction: rule }
}

/** Подпись прогресса: «Шаг 2 из 4». */
export const progressLabel = (s: TutorialState): string =>
  `Шаг ${Math.min(s.index + 1, TUTORIAL_STEPS.length)} из ${TUTORIAL_STEPS.length}`
