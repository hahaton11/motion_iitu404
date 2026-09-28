import type { HintEvt } from '../contracts/input'

/**
 * Логика единого слоя подсказок. Одна подсказка за раз, warn вытесняет info, info не перебивает warn.
 * Подсказка живёт HINT_SHOW_MS или до правильного действия. Один код не повторяется чаще REPEAT_MS.
 * Статистика показанных подсказок по кодам нужна финалу.
 */

export const HINT_SHOW_MS = 2500
/** Тот же код после исчезновения показывается снова не раньше. */
export const REPEAT_MS = 4000
/** Подсказка той же важности не сменяет текущую раньше, чтобы текст успели прочитать. */
export const MIN_SHOW_MS = 900

export interface ShownHint {
  readonly hint: HintEvt
  readonly shownAt: number
}

export interface HintLayerState {
  readonly current?: ShownHint
  readonly lastShown: Readonly<Record<string, number>>
  readonly counts: Readonly<Record<string, number>>
}

export interface OfferResult {
  readonly state: HintLayerState
  /** Подсказка, которую надо показать сейчас. undefined — оставить как есть. */
  readonly show?: HintEvt
}

export const initialHintLayer = (): HintLayerState => ({ lastShown: {}, counts: {} })

const visible = (s: HintLayerState, now: number): ShownHint | undefined =>
  s.current && now - s.current.shownAt < HINT_SHOW_MS ? s.current : undefined

function blocked(cur: ShownHint | undefined, hint: HintEvt, now: number): boolean {
  if (!cur) return false
  if (cur.hint.severity === 'warn' && hint.severity === 'info') return true
  if (cur.hint.severity === hint.severity) return now - cur.shownAt < MIN_SHOW_MS
  return false
}

export function offerHint(s: HintLayerState, hint: HintEvt, now: number): OfferResult {
  const cur = visible(s, now)
  if (cur && cur.hint.code === hint.code) return { state: { ...s, current: { hint, shownAt: now } } }
  const last = s.lastShown[hint.code]
  if (last !== undefined && now - last < REPEAT_MS) return { state: s }
  if (blocked(cur, hint, now)) return { state: s }
  const state: HintLayerState = {
    current: { hint, shownAt: now },
    lastShown: { ...s.lastShown, [hint.code]: now },
    counts: { ...s.counts, [hint.code]: (s.counts[hint.code] ?? 0) + 1 },
  }
  return { state, show: hint }
}

/** true в hide — время показа вышло, тост надо спрятать. */
export function tickHints(s: HintLayerState, now: number): { readonly state: HintLayerState; readonly hide: boolean } {
  if (!s.current || visible(s, now)) return { state: s, hide: false }
  const { current: _c, ...rest } = s
  return { state: rest, hide: true }
}

/** Правильное действие убирает текущую подсказку. */
export function dismissHint(s: HintLayerState): HintLayerState {
  if (!s.current) return s
  const { current: _c, ...rest } = s
  return rest
}

export const resetStats = (s: HintLayerState): HintLayerState => ({ ...s, counts: {} })

export const totalHints = (counts: Readonly<Record<string, number>>): number =>
  Object.values(counts).reduce((a, b) => a + b, 0)

/** Самый частый код; при равенстве тот, что встретился раньше в объекте. */
export function topHintCode(counts: Readonly<Record<string, number>>): string | undefined {
  let best: string | undefined
  let bestN = 0
  Object.entries(counts).forEach(([code, n]) => {
    if (n > bestN) {
      best = code
      bestN = n
    }
  })
  return best
}
