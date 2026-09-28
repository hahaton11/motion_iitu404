import type { InputEventMap, InputEventType, Unsubscribe } from '../contracts/input'

type Handler<K extends InputEventType> = (e: InputEventMap[K]) => void

/** Типизированный emitter для реализаций InputSource. */
export class InputEmitter {
  private readonly handlers = new Map<InputEventType, Set<Handler<never>>>()

  on<K extends InputEventType>(type: K, fn: Handler<K>): Unsubscribe {
    const set = this.handlers.get(type) ?? new Set()
    set.add(fn as Handler<never>)
    this.handlers.set(type, set)
    return () => set.delete(fn as Handler<never>)
  }

  emit<K extends InputEventType>(type: K, e: InputEventMap[K]): void {
    this.handlers.get(type)?.forEach((fn) => (fn as Handler<K>)(e))
  }
}
