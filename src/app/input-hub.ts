import type { HandId, InputEventMap, InputEventType, InputSource, Unsubscribe } from '../contracts/input'
import { InputEmitter } from '../shared/emitter'

/**
 * Один источник ввода на всё приложение с двумя каналами.
 * raw — всегда: курсор приложения, жестовые кнопки, подсказки камеры.
 * board — только пока открыта доска: экраны поверх неё не двигают элементы.
 * Подсказки в канал доски не идут: слой подсказок берёт их из raw, чтобы не было дублей.
 * Источник можно сменить на лету, например камеру на мышь после отказа.
 */

const TYPES: readonly InputEventType[] = ['cursor', 'grab', 'release', 'throw', 'point', 'zoom', 'pan', 'swipe', 'handlost', 'hint']

/**
 * Прокси-источник: запуском и остановкой настоящего источника управляет хаб.
 * Ответ потребителя о несомом элементе уходит в текущий источник.
 */
function proxy(em: InputEmitter, source: () => InputSource | undefined): InputSource {
  return {
    on: (type, fn) => em.on(type, fn),
    start: async () => undefined,
    stop: () => undefined,
    setCarrying: (hand, carrying) => source()?.setCarrying?.(hand, carrying),
  }
}

export class InputHub {
  readonly raw: InputSource
  readonly board: InputSource
  private readonly rawEm = new InputEmitter()
  private readonly boardEm = new InputEmitter()
  private source: InputSource | undefined
  private offs: Unsubscribe[] = []
  private boardOpen = false
  private readonly hands = new Set<HandId>()

  constructor() {
    this.raw = proxy(this.rawEm, () => this.source)
    this.board = proxy(this.boardEm, () => this.source)
  }

  get current(): InputSource | undefined {
    return this.source
  }

  /** Подключает новый источник, старый отписывается и останавливается. Запускает вызывающий. */
  use(source: InputSource): void {
    this.detach()
    this.source = source
    this.offs = TYPES.map((type) => source.on(type, (e) => this.forward(type, e)))
  }

  detach(): void {
    this.offs.splice(0).forEach((off) => off())
    this.releaseHands()
    this.source?.stop()
    this.source = undefined
  }

  setBoardOpen(open: boolean): void {
    if (open === this.boardOpen) return
    if (!open) this.releaseHands()
    this.boardOpen = open
  }

  isBoardOpen(): boolean {
    return this.boardOpen
  }

  private forward<K extends InputEventType>(type: K, e: InputEventMap[K]): void {
    if (type === 'cursor') this.hands.add((e as InputEventMap['cursor']).hand)
    if (type === 'handlost') this.hands.delete((e as InputEventMap['handlost']).hand)
    this.rawEm.emit(type, e)
    if (this.boardOpen && type !== 'hint') this.boardEm.emit(type, e)
  }

  /** Доска получает handlost по всем рукам, чтобы уронить удерживаемое и забыть руки. */
  private releaseHands(): void {
    if (this.boardOpen) this.hands.forEach((hand) => this.boardEm.emit('handlost', { hand }))
    this.hands.clear()
  }
}
