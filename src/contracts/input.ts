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
  /** 0 = ладонь раскрыта, 1 = кулак. */
  readonly closure: number
  readonly holding: boolean
  /**
   * false — рука в бездействии, курсор стоит и действий нет. Источники без распознавания
   * бездействия, например мышь, поле не заполняют.
   */
  readonly engaged?: boolean
  /**
   * true — рука держит жест панорамы (указательный и средний вытянуты), доска двигается событиями `pan`,
   * а курсор стоит на месте. Источники без панорамы поле не заполняют.
   */
  readonly panning?: boolean
  /**
   * true — рука держит щипок и зумит доску ходом вверх и вниз, доска масштабируется событиями `zoom`,
   * а курсор стоит на месте. Источники без зума щипком поле не заполняют.
   */
  readonly zooming?: boolean
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

/** Вытянут только указательный палец, удержание 600 мс. */
export interface PointEvt {
  readonly hand: HandId
  readonly x: number
  readonly y: number
}

/**
 * Масштаб доски. factor относительно предыдущего события. Две руки в захвате: cx/cy — середина между руками.
 * Щипок одной рукой: cx/cy — точка курсора в момент, когда щипок сомкнулся. Колесо мыши: точка курсора.
 */
export interface ZoomEvt {
  readonly factor: number
  readonly cx: number
  readonly cy: number
}

/**
 * Панорама доски жестом двух пальцев: сдвиг руки с прошлого события в долях экрана, уже зеркально.
 * Приходит, пока рука держит жест и двигается. Доска сдвигается вслед за рукой.
 */
export interface PanEvt {
  readonly hand: HandId
  readonly dx: number
  readonly dy: number
}

/**
 * Наклон плоскости доски: приращение в градусах с прошлого события. Щипок одной рукой,
 * ход вбок — та же поза, что масштабирует ходом вверх и вниз, только другая ось.
 * Источники, которые наклон не умеют, событие не шлют.
 */
export interface TiltEvt {
  readonly hand: HandId
  readonly delta: number
}

export type SwipeDir = 'left' | 'right' | 'up' | 'down'

/** Короткий взмах рукой. Направление на экране, уже зеркально. Приходит после завершения движения. */
export interface SwipeEvt {
  readonly hand: HandId
  readonly dir: SwipeDir
  /** Рука держала элемент во время взмаха. */
  readonly holding: boolean
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
  | 'SWIPE_SHORT'
  | 'SWIPE_DIAGONAL'
  | 'HALF_PAN'
  | 'HALF_PINCH'

/** Подсказка режима «ошибка». message — конкретное действие для исправления, на русском. */
export interface HintEvt {
  readonly code: MotionHintCode | (string & {})
  readonly message: string
  readonly severity: 'info' | 'warn'
  readonly hand?: HandId
  /**
   * Условие, вызвавшее подсказку с этим кодом, перестало выполняться: её можно убрать с экрана,
   * не досиживая положенное время. Поле необязательное — источники, которые не умеют следить
   * за своими условиями, его просто не заполняют, и подсказка живёт как раньше, по таймеру.
   * `message` в таком событии пустой: показывать его нельзя, это не подсказка, а снятие.
   */
  readonly cleared?: true
}

export interface InputEventMap {
  cursor: CursorEvt
  grab: GrabEvt
  release: ReleaseEvt
  throw: ThrowEvt
  point: PointEvt
  zoom: ZoomEvt
  pan: PanEvt
  tilt: TiltEvt
  swipe: SwipeEvt
  handlost: HandLostEvt
  hint: HintEvt
}

export type InputEventType = keyof InputEventMap
export type Unsubscribe = () => void

export interface InputSource {
  on<K extends InputEventType>(type: K, fn: (e: InputEventMap[K]) => void): Unsubscribe
  start(): Promise<void>
  stop(): void
  /**
   * Необязательная обратная связь от потребителя: держит ли рука элемент. Источник не знает, что
   * под курсором, а захват прилипает, только когда в руке элемент: пока рука его несёт, раскрытая
   * ладонь не отпускает, положить можно щелчком кулак → ладонь. false — элемент ушёл из руки без
   * жеста (карман, удаление): рука свободна, release не нужен. Источники без прилипания не реализуют.
   */
  setCarrying?(hand: HandId, carrying: boolean): void
}
