export type Unsubscribe = () => void

/** Маленький типизированный emitter для публичных событий кармана и голоса. */
export class TypedEmitter<M> {
  private readonly handlers = new Map<keyof M, Set<(e: never) => void>>()

  on<K extends keyof M>(type: K, fn: (e: M[K]) => void): Unsubscribe {
    const set = this.handlers.get(type) ?? new Set()
    set.add(fn as (e: never) => void)
    this.handlers.set(type, set)
    return () => set.delete(fn as (e: never) => void)
  }

  emit<K extends keyof M>(type: K, e: M[K]): void {
    this.handlers.get(type)?.forEach((fn) => (fn as (e: M[K]) => void)(e))
  }

  clear(): void {
    this.handlers.clear()
  }
}
