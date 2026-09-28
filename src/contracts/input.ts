/**
 * Единый контракт между источниками ввода (камера, мышь) и потребителями (доска, карман, сценарий).
 * Все координаты нормированы 0..1 относительно экрана, уже зеркалированы и сглажены.
 * Меняется только по явному решению, так как на нём стыкуются все модули.
 */

export type HandId = 'left' | 'right'

/** Каждый кадр, 30–60 Гц, пока рука в кадре. */
export interface CursorEvt {
  readonly hand: HandId
  readonly x: number
  readonly y: number
  /** Сила захвата: 0 = отпущено, 1 = захват. У камеры это щипок большим и указательным. */
  readonly closure: number
  readonly holding: boolean
  /**
   * Сцеп трекпада: рука сейчас ведёт курсор. false — рука свободна, курсор стоит.
   * Источники без сцепа, например мышь, поле не заполняют.
   */
  readonly engaged?: boolean
}

export interface GrabEvt {
  readonly hand: HandId
  readonly x: number
  readonly y: number
}

/** Скорость в долях экрана в секунду. */
export interface ReleaseEvt {
  readonly hand: HandId
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
}

/** Отпускание с высокой скоростью. Приходит вместо release, не вместе с ним. */
export type ThrowEvt = ReleaseEvt

/** Удержание указательного жеста 600 мс. У камеры это «V»: указательный и средний вытянуты. */
export interface PointEvt {
  readonly hand: HandId
  readonly x: number
  readonly y: number
}

/** Обе руки в захвате. factor относительно предыдущего события, cx/cy — середина между руками. */
export interface ZoomEvt {
  readonly factor: number
  readonly cx: number
  readonly cy: number
}

export interface HandLostEvt {
  readonly hand: HandId
}

export type MotionHintCode =
  | 'NO_HAND'
  | 'HAND_NEAR_EDGE'
  | 'TOO_FAR'
  | 'TOO_CLOSE'
  | 'HALF_GRAB'
  | 'HALF_RELEASE'
  | 'MOVING_TOO_FAST'
  | 'POOR_TRACKING'
  | 'HAND_TOO_HIGH'
  | 'NOT_POINTING'

/** Подсказка режима «ошибка». message — конкретное действие для исправления, на русском. */
export interface HintEvt {
  readonly code: MotionHintCode | (string & {})
  readonly message: string
  readonly severity: 'info' | 'warn'
  readonly hand?: HandId
}

export interface InputEventMap {
  cursor: CursorEvt
  grab: GrabEvt
  release: ReleaseEvt
  throw: ThrowEvt
  point: PointEvt
  zoom: ZoomEvt
  handlost: HandLostEvt
  hint: HintEvt
}

export type InputEventType = keyof InputEventMap
export type Unsubscribe = () => void

export interface InputSource {
  on<K extends InputEventType>(type: K, fn: (e: InputEventMap[K]) => void): Unsubscribe
  start(): Promise<void>
  stop(): void
}
