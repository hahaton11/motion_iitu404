import type { HintEvt } from '../contracts/input'
import { rect, type WorldPoint, type WorldRect } from './zones'

/**
 * Обучение из семи шагов. Каждый шаг ждёт правильного действия, на ошибку отвечает подсказкой.
 * Чистый редьюсер: события доски и кармана приходят снаружи, реакция возвращается экрану.
 *
 * Шаги идут группами: сначала перенос и бросок — то, что делают с элементом; затем панорама
 * и зум — то, что делают с самой доской; затем карман и голос. Навигационные жесты вынесены
 * в свои шаги намеренно: их не на чем показать мимоходом, и без задания их просто не находят.
 */

export type TutorialStepId = 'move' | 'throw' | 'pan' | 'zoom' | 'take' | 'put' | 'voice'

/** Иконка жеста для карточки шага и подсказки. */
export type GestureIcon = 'fist' | 'palm' | 'throw' | 'point' | 'victory' | 'zoom' | 'pocket' | 'voice' | 'hand' | 'light'

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

/**
 * Метка для шага панорамы. При камере в нуле она висит у правого края: видно, что она есть,
 * и видно, что до центра её надо довезти. Одного размаха руки на это хватает.
 */
export const TUTORIAL_PAN_TARGET: WorldRect = rect(470, -140, 790, 20)

/** Табличка с мелким текстом для шага зума: в масштабе 1 надпись не читается. */
export const TUTORIAL_ZOOM_TARGET: WorldRect = rect(-160, -90, 160, 70)

/** Во сколько раз нужно приблизить доску, чтобы шаг зума засчитался. */
export const TUTORIAL_ZOOM_GOAL = 1.6

/**
 * Метка приведена в центр: её середина попала в середину экрана с запасом в пятую долю.
 * Полоса по вертикали шире — наклонённая плоскость сжимает дальний край, и попасть
 * точно по высоте труднее, чем по ширине.
 */
export const panCentered = (p: WorldPoint): boolean => p.x > 0.3 && p.x < 0.7 && p.y > 0.2 && p.y < 0.8

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'move',
    title: 'Возьми и перенеси',
    instruction: 'Сожми кулак на сообщении и перенеси его в рамку справа. Там сожми кулак и сразу раскрой ладонь',
    note: 'Сообщение прилипает к руке: можно раскрыть ладонь, оно не упадёт. Кладёт только быстрый щелчок кулак → ладонь',
    icon: 'fist',
    spawn: { x: -300, y: -30 },
    spawnText: 'Перенеси меня в рамку',
  },
  {
    id: 'throw',
    title: 'Выброси в шлюз',
    instruction: 'Возьми сообщение, резко махни рукой в сторону и на ходу сожми кулак и сразу раскрой ладонь',
    note: 'Щелчок на ходу удаляет, на месте — кладёт. Просто быстрый перенос ничего не удаляет',
    icon: 'throw',
    spawn: { x: -40, y: -30 },
    spawnText: 'Выброси меня',
  },
  {
    id: 'pan',
    title: 'Подвинь доску',
    instruction: 'Покажи два пальца — указательный и средний — и веди руку в сторону. Доска поедет за рукой: приведи метку справа в центр',
    note: 'Прицел на время панорамы стоит на месте, и элементы не берутся. С мышью: перетаскивание средней кнопкой или пробел с левой',
    icon: 'victory',
  },
  {
    id: 'zoom',
    title: 'Приблизь доску',
    instruction: 'Сомкни щипок — большой и указательный — и веди руку вверх. Приблизь так, чтобы прочитать мелкую надпись на табличке',
    note: 'Рука вниз — доска отдаляется. Масштаб растёт вокруг точки, где щипок сомкнулся. С мышью: Alt и перетаскивание вверх',
    icon: 'zoom',
  },
  {
    id: 'take',
    title: 'Достань из кармана',
    instruction: 'Задержи открытую ладонь над карманом внизу, затем сожми кулак над карточкой',
    note: 'Карточка прилипнет к руке. Заготовки с замком не кончаются, достаётся копия',
    icon: 'pocket',
  },
  {
    id: 'put',
    title: 'Убери в карман',
    instruction: 'Поднеси сообщение к карману внизу и задержи над ним, пока карман не заполнится',
    note: 'Жест не нужен: сообщение само ляжет в карман. Карман помнит содержимое и после перезагрузки',
    icon: 'pocket',
    spawn: { x: -40, y: -30 },
    spawnText: 'Положи меня в карман',
  },
  {
    id: 'voice',
    title: 'Продиктуй текст',
    instruction: 'Укажи пальцем на стикер и задержи, а когда появится плашка «Говори» — скажи идею вслух',
    note: 'С мышью: Shift и удержание кнопки на стикере. Замолчи на полторы секунды — текст запишется',
    icon: 'voice',
    spawn: { x: -40, y: -30 },
    spawnText: 'Скажи сюда идею',
  },
]

export const TUTORIAL_HINTS = {
  DROP_IN_FRAME: { code: 'TUT_DROP_IN_FRAME', message: 'Донеси стикер до рамки справа и щёлкни кулаком уже внутри неё', severity: 'info' },
  NO_THROW: {
    code: 'TUT_NO_THROW',
    message: 'Остановись над рамкой и только потом сожми и раскрой кулак: щелчок на ходу удаляет',
    severity: 'warn',
  },
  KEEP_ON_BOARD: { code: 'TUT_KEEP_ON_BOARD', message: 'Перенеси стикер в рамку, а не в карман', severity: 'info' },
  THROW_FASTER: { code: 'TUT_THROW_FASTER', message: 'Махни резче и щёлкни кулаком на ходу, не останавливая руку', severity: 'warn' },
  THROW_NOT_POCKET: { code: 'TUT_THROW_NOT_POCKET', message: 'Брось стикер в сторону: над карманом он сохраняется', severity: 'info' },
  PAN_TWO_FINGERS: {
    code: 'TUT_PAN_TWO_FINGERS',
    message: 'Не сжимай кулак: доску двигают два пальца — указательный и средний',
    severity: 'warn',
  },
  PAN_FARTHER: { code: 'TUT_PAN_FARTHER', message: 'Веди руку дальше, пока метка не окажется в середине экрана', severity: 'info' },
  ZOOM_PINCH: {
    code: 'TUT_ZOOM_PINCH',
    message: 'Не сжимай кулак: масштаб меняет щипок — сомкни большой и указательный',
    severity: 'warn',
  },
  ZOOM_UP: { code: 'TUT_ZOOM_UP', message: 'Веди щипок выше: пока рука идёт вверх, доска приближается', severity: 'info' },
  OPEN_POCKET: { code: 'TUT_OPEN_POCKET', message: 'Задержи открытую ладонь над карманом внизу, чтобы он открылся', severity: 'info' },
  PUT_NO_THROW: { code: 'TUT_PUT_NO_THROW', message: 'Не щёлкай кулаком: поднеси элемент к карману и задержи над ним', severity: 'warn' },
  PUT_LOWER: { code: 'TUT_PUT_LOWER', message: 'Поднеси элемент ниже, к карману внизу экрана, и задержи над ним', severity: 'info' },
  VOICE_POINT: {
    code: 'TUT_VOICE_POINT',
    message: 'Не сжимай кулак: укажи на стикер пальцем и задержи, чтобы диктовать',
    severity: 'info',
  },
} as const satisfies Record<string, HintEvt>

export type TutorialEvent =
  | { readonly type: 'grab' }
  /** Элемент отпущен на доске. inFrame — центр в рамке первого шага. */
  | { readonly type: 'drop'; readonly inFrame: boolean }
  | { readonly type: 'throw' }
  | { readonly type: 'put' }
  | { readonly type: 'take' }
  /** Панорама остановилась. centered — метка шага оказалась в середине экрана. */
  | { readonly type: 'panned'; readonly centered: boolean }
  /** Масштаб перестал меняться. reached — доска приближена не меньше, чем требует шаг. */
  | { readonly type: 'zoomed'; readonly reached: boolean }
  /** Диктовка в стикер закончилась или голос недоступен, а стикер выбран жестом диктовки. */
  | { readonly type: 'dictated' }
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
  // Кулак на шаге навигации — самая частая попытка: доску тянут, как мышью.
  pan: { grab: hint(TUTORIAL_HINTS.PAN_TWO_FINGERS), throw: hint(TUTORIAL_HINTS.PAN_TWO_FINGERS) },
  zoom: { grab: hint(TUTORIAL_HINTS.ZOOM_PINCH), throw: hint(TUTORIAL_HINTS.ZOOM_PINCH) },
  take: { take: 'ok', grab: hint(TUTORIAL_HINTS.OPEN_POCKET) },
  put: { put: 'ok', throw: hint(TUTORIAL_HINTS.PUT_NO_THROW, true), drop: hint(TUTORIAL_HINTS.PUT_LOWER) },
  voice: { dictated: 'ok', grab: hint(TUTORIAL_HINTS.VOICE_POINT), throw: hint(TUTORIAL_HINTS.VOICE_POINT, true) },
}

function ruleFor(step: TutorialStep, e: TutorialEvent): TutorialReaction | 'ok' {
  if (e.type === 'skip') return 'ok'
  if (step.id === 'move' && e.type === 'drop') return e.inFrame ? 'ok' : hint(TUTORIAL_HINTS.DROP_IN_FRAME)
  // Жест получился, но цель не достигнута: подсказка говорит, что движение надо продолжить,
  // а не что оно неправильное. Шаг остаётся на месте и ждёт следующей попытки.
  if (step.id === 'pan' && e.type === 'panned') return e.centered ? 'ok' : hint(TUTORIAL_HINTS.PAN_FARTHER)
  if (step.id === 'zoom' && e.type === 'zoomed') return e.reached ? 'ok' : hint(TUTORIAL_HINTS.ZOOM_UP)
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
