import type { HintEvt } from '../contracts/input'
import { fanHit, POCKET_HEIGHT, type FanSlot, type Viewport } from './fan'

/**
 * Зона кармана для одной руки: попадание, таймер открытия, закрытие веера, листание и подсказки.
 * Чистый редьюсер: время приходит во входе, таймеров внутри нет.
 */

/** Пустая рука над карманом столько держится, прежде чем веер раскроется. */
export const OPEN_DWELL_MS = 400
/** Короче этого рука просто пролетела мимо: подсказку не показываем. */
export const HOVER_MIN_MS = 120
/** Рука ушла из области веера: столько ждём, прежде чем закрыть. */
export const CLOSE_GRACE_MS = 350
/** Полоса над карманом, где элемент «почти у кармана», в долях экрана. */
export const NEAR_BAND = 0.1
export const NEAR_MS = 700
/** Кулак застрял между «сжат» и «раскрыт». */
export const STUCK_MIN = 0.45
export const STUCK_MAX = 0.75
export const STUCK_MS = 600
/** Выше этого closure рука считается сжатой и веер не открывает. */
export const FIST_CLOSURE = 0.6
/** Листание: раскрытая рука, быстрый горизонтальный мах. */
export const SWIPE_OPEN_MAX = 0.35
export const SWIPE_WINDOW_MS = 260
export const SWIPE_DIST = 0.14
export const SWIPE_MAX_SLOPE = 0.6
export const SWIPE_COOLDOWN_MS = 380
export const SWIPE_STEP = 3
/** Одна и та же подсказка не чаще, чем раз в это время. */
export const HINT_COOLDOWN_MS = 6000

export const POCKET_HINTS = {
  NEAR: { code: 'POCKET_NEAR', message: 'Поднеси элемент ниже, к карману', severity: 'info' },
  HOVER_SHORT: {
    code: 'POCKET_HOVER_SHORT',
    message: 'Задержи руку над карманом, чтобы он открылся',
    severity: 'info',
  },
  STUCK: {
    code: 'POCKET_STUCK',
    message: 'Разведи большой и указательный над карманом, чтобы положить элемент',
    severity: 'warn',
  },
} as const satisfies Record<string, HintEvt>

export type PocketHintKey = keyof typeof POCKET_HINTS

export type ZonePhase = 'idle' | 'hover' | 'open'

interface Sample {
  readonly x: number
  readonly y: number
  readonly t: number
}

export interface HandZone {
  readonly phase: ZonePhase
  /** Начало текущей фазы hover. */
  readonly since: number
  /** Рука покинула область открытого веера. */
  readonly outsideAt?: number
  readonly nearAt?: number
  readonly stuckAt?: number
  readonly nearHinted: boolean
  readonly stuckHinted: boolean
  readonly swipe: readonly Sample[]
  readonly swipeAt: number
}

/** carrying — эта рука держит элемент доски; fist — кулак сжат (удержание или панорама). */
export interface ZoneCursor {
  readonly type: 'cursor'
  readonly x: number
  readonly y: number
  readonly closure: number
  readonly carrying: boolean
  readonly fist: boolean
  readonly t: number
}

export type ZoneInput = ZoneCursor | { readonly type: 'tick'; readonly t: number } | { readonly type: 'lost' }

export type ZoneEvent =
  | { readonly type: 'open' }
  | { readonly type: 'close' }
  | { readonly type: 'scroll'; readonly delta: number }
  | { readonly type: 'hint'; readonly key: PocketHintKey }

/** fanTop — верх области веера в долях экрана. */
export interface ZoneContext {
  readonly fanTop: number
}

export interface ZoneResult {
  readonly zone: HandZone
  readonly events: readonly ZoneEvent[]
}

export const initialZone = (): HandZone => ({
  phase: 'idle',
  since: 0,
  nearHinted: false,
  stuckHinted: false,
  swipe: [],
  swipeAt: -Infinity,
})

export const inPocket = (y: number): boolean => y >= 1 - POCKET_HEIGHT

export const nearPocket = (y: number): boolean => !inPocket(y) && y >= 1 - POCKET_HEIGHT - NEAR_BAND

const isStuck = (closure: number): boolean => closure >= STUCK_MIN && closure <= STUCK_MAX

const done = (zone: HandZone, events: readonly ZoneEvent[] = []): ZoneResult => ({ zone, events })

/** Карточка веера под прицелом, x и y в долях экрана. */
export const pickCard = (slots: readonly FanSlot[], x: number, y: number, vp: Viewport): number | undefined =>
  fanHit(slots, x * vp.w, y * vp.h)

function trackCarry(z: HandZone, e: ZoneCursor): HandZone {
  const near = nearPocket(e.y)
  const stuck = inPocket(e.y) && isStuck(e.closure)
  const { nearAt: _n, stuckAt: _s, outsideAt: _o, ...rest } = z
  return {
    ...rest,
    phase: 'idle',
    swipe: [],
    nearHinted: near && z.nearHinted,
    stuckHinted: stuck && z.stuckHinted,
    ...(near ? { nearAt: z.nearAt ?? e.t } : {}),
    ...(stuck ? { stuckAt: z.stuckAt ?? e.t } : {}),
  }
}

function detectSwipe(z: HandZone, e: ZoneCursor): ZoneResult {
  if (e.closure > SWIPE_OPEN_MAX) return done({ ...z, swipe: [] })
  const swipe = [...z.swipe.filter((s) => e.t - s.t <= SWIPE_WINDOW_MS), { x: e.x, y: e.y, t: e.t }]
  const first = swipe[0]
  const dx = first ? e.x - first.x : 0
  const dy = first ? e.y - first.y : 0
  const fast = Math.abs(dx) >= SWIPE_DIST && Math.abs(dy) <= Math.abs(dx) * SWIPE_MAX_SLOPE
  if (!fast || e.t - z.swipeAt < SWIPE_COOLDOWN_MS) return done({ ...z, swipe })
  const delta = dx < 0 ? SWIPE_STEP : -SWIPE_STEP
  return done({ ...z, swipe: [], swipeAt: e.t }, [{ type: 'scroll', delta }])
}

function trackEmpty(z: HandZone, e: ZoneCursor, ctx: ZoneContext): ZoneResult {
  const base: HandZone = { ...initialZone(), phase: z.phase, since: z.since, swipe: z.swipe, swipeAt: z.swipeAt }
  const over = inPocket(e.y) && !e.fist
  if (z.phase === 'idle') return done(over ? { ...base, phase: 'hover', since: e.t, swipe: [] } : { ...base, swipe: [] })
  if (z.phase === 'hover') {
    if (over) return done(base)
    const dwell = e.t - z.since
    const hint: ZoneEvent[] = dwell >= HOVER_MIN_MS ? [{ type: 'hint', key: 'HOVER_SHORT' }] : []
    return done({ ...base, phase: 'idle', swipe: [] }, hint)
  }
  const outside = e.y < ctx.fanTop
  const next: HandZone = outside ? { ...base, outsideAt: z.outsideAt ?? e.t } : base
  return detectSwipe(next, e)
}

/** Проверка таймеров: открытие, закрытие, подсказки удержания у кармана. */
function advance(z: HandZone, t: number): ZoneResult {
  if (z.phase === 'hover' && t - z.since >= OPEN_DWELL_MS) return done({ ...z, phase: 'open' }, [{ type: 'open' }])
  if (z.phase === 'open' && z.outsideAt !== undefined && t - z.outsideAt >= CLOSE_GRACE_MS) {
    const { outsideAt: _o, ...rest } = z
    return done({ ...rest, phase: 'idle', swipe: [] }, [{ type: 'close' }])
  }
  if (z.nearAt !== undefined && !z.nearHinted && t - z.nearAt >= NEAR_MS) {
    return done({ ...z, nearHinted: true }, [{ type: 'hint', key: 'NEAR' }])
  }
  if (z.stuckAt !== undefined && !z.stuckHinted && t - z.stuckAt >= STUCK_MS) {
    return done({ ...z, stuckHinted: true }, [{ type: 'hint', key: 'STUCK' }])
  }
  return done(z)
}

function onCursor(z: HandZone, e: ZoneCursor, ctx: ZoneContext): ZoneResult {
  if (e.carrying) {
    const closing: ZoneEvent[] = z.phase === 'open' ? [{ type: 'close' }] : []
    const r = advance(trackCarry(z, e), e.t)
    return done(r.zone, [...closing, ...r.events])
  }
  const moved = trackEmpty(z, e, ctx)
  const r = advance(moved.zone, e.t)
  return done(r.zone, [...moved.events, ...r.events])
}

export function stepZone(z: HandZone, input: ZoneInput, ctx: ZoneContext): ZoneResult {
  switch (input.type) {
    case 'cursor':
      return onCursor(z, input, ctx)
    case 'tick':
      return advance(z, input.t)
    case 'lost':
      return done(initialZone(), z.phase === 'open' ? [{ type: 'close' }] : [])
  }
}

/** Разрешает подсказку, если с прошлого показа этого кода прошло достаточно времени. */
export function hintAllowed(last: Readonly<Record<string, number>>, code: string, now: number): boolean {
  const prev = last[code]
  return prev === undefined || now - prev >= HINT_COOLDOWN_MS
}
