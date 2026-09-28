/**
 * Машина экранов приложения. Чистая: состояние и событие дают новое состояние,
 * недопустимое для текущего экрана событие возвращает то же состояние.
 */

export type Screen = 'start' | 'camera' | 'calibration' | 'tutorial' | 'challenge' | 'final' | 'free'

export type InputMode = 'camera' | 'mouse'

export interface FlowState {
  readonly screen: Screen
  readonly mode: InputMode
  /** Обучение пройдено в этой сессии: повторный старт ведёт сразу в челлендж. */
  readonly tutorialDone: boolean
}

export type FlowEvent =
  | { readonly type: 'setMode'; readonly mode: InputMode }
  | { readonly type: 'start' }
  | { readonly type: 'cameraReady' }
  | { readonly type: 'useMouse' }
  | { readonly type: 'calibrated' }
  | { readonly type: 'skipCalibration' }
  | { readonly type: 'tutorialDone' }
  | { readonly type: 'challengeDone' }
  | { readonly type: 'again' }
  | { readonly type: 'free' }
  | { readonly type: 'home' }

export const initialFlow = (mode: InputMode): FlowState => ({ screen: 'start', mode, tutorialDone: false })

const go = (s: FlowState, screen: Screen): FlowState => (s.screen === screen ? s : { ...s, screen })

/** Экран после подготовки ввода: обучение один раз, затем сразу челлендж. */
const afterSetup = (s: FlowState): FlowState => go(s, s.tutorialDone ? 'challenge' : 'tutorial')

/** Из каких экранов событие допустимо. */
const ALLOWED: Readonly<Record<FlowEvent['type'], readonly Screen[]>> = {
  setMode: ['start'],
  start: ['start'],
  cameraReady: ['camera'],
  useMouse: ['start', 'camera', 'calibration'],
  calibrated: ['calibration'],
  skipCalibration: ['calibration'],
  tutorialDone: ['tutorial'],
  challengeDone: ['challenge'],
  again: ['final'],
  free: ['start', 'final'],
  home: ['camera', 'calibration', 'tutorial', 'challenge', 'final', 'free'],
}

export function nextFlow(s: FlowState, e: FlowEvent): FlowState {
  if (!ALLOWED[e.type].includes(s.screen)) return s
  switch (e.type) {
    case 'setMode':
      return s.mode === e.mode ? s : { ...s, mode: e.mode }
    case 'start':
      return s.mode === 'camera' ? go(s, 'camera') : afterSetup(s)
    case 'cameraReady':
      return go(s, 'calibration')
    case 'useMouse':
      return afterSetup({ ...s, mode: 'mouse' })
    case 'calibrated':
    case 'skipCalibration':
      return afterSetup(s)
    case 'tutorialDone':
      return { ...s, screen: 'challenge', tutorialDone: true }
    case 'challengeDone':
      return go(s, 'final')
    case 'again':
      return go(s, 'challenge')
    case 'free':
      return go(s, 'free')
    case 'home':
      return go(s, 'start')
  }
}

/** Экраны, где на весь экран живёт доска и ввод идёт в неё. */
export const BOARD_SCREENS: readonly Screen[] = ['tutorial', 'challenge', 'free']

export const isBoardScreen = (screen: Screen): boolean => BOARD_SCREENS.includes(screen)

/** Режим ввода из адреса: ?input=mouse включает мышь, иначе камера. */
export function modeFromQuery(search: string): InputMode {
  return new URLSearchParams(search).get('input') === 'mouse' ? 'mouse' : 'camera'
}
