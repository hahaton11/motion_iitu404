import type { HintEvt } from '../contracts/input'
import { centerIn, rect, touchesEdge, type Placed, type WorldRect } from './zones'

/**
 * Челлендж «Разбери поток»: 12 входящих сообщений, три системы и шлюз.
 * Девять раскладываются по системам, три помехи выбрасываются, одно новое достаётся из кармана.
 * Раскладка задана в мировых координатах для экрана 1440×900, камера подгоняет её зумом.
 *
 * Сценарий выбран под то, чем управляют руками: оператор стоит перед большим экраном,
 * до которого не дотягивается и которого не касается. Выброс помехи в шлюз — это тот же
 * резкий бросок, и здесь он означает ровно то, на что похож.
 */

export type ClusterId = 'power' | 'comms' | 'life'
export type IdeaTarget = ClusterId | 'trash'

export interface Cluster {
  readonly id: ClusterId
  readonly title: string
  readonly rect: WorldRect
}

export interface ChallengeIdea {
  readonly id: string
  readonly text: string
  readonly target: IdeaTarget
}

/** Элемент доски в виде, нужном для проверки. */
export interface CheckedElement extends Placed {
  readonly id: string
}

export interface Evaluation {
  /** Полезные идеи в своих кластерах. */
  readonly placed: number
  /** Лишние идеи убраны с доски. */
  readonly discarded: number
  /** В кластер добавлен новый элемент. */
  readonly added: boolean
  readonly correct: number
  readonly total: number
  /** Точность 0..100. */
  readonly accuracy: number
  readonly perfect: boolean
}

/** Нейтральный прогресс для шапки: не выдаёт, верно ли разложено. */
export interface ChallengeProgress {
  readonly inClusters: number
  readonly removed: number
  readonly added: boolean
}

export const CHALLENGE_TITLE = 'Разбери поток: смена у пульта'
export const CHALLENGE_TASK = 'Разведи сообщения по системам, 3 помехи выброси в шлюз, 1 донесение достань из кармана'

/** Раскладка для экрана этого размера в мировых единицах, камера подгоняет её зумом. */
export const LAYOUT_W = 1480
export const LAYOUT_H = 920
export const STICKER_SIZE = 140
export const CHALLENGE_LIMIT_MS = 180_000

export const CLUSTERS: readonly Cluster[] = [
  { id: 'power', title: 'Энергия', rect: rect(-700, -335, -260, -30) },
  { id: 'comms', title: 'Связь', rect: rect(-220, -335, 220, -30) },
  { id: 'life', title: 'Жизнеобеспечение', rect: rect(260, -335, 700, -30) },
]

export const TRASH: WorldRect = rect(300, 0, 700, 310)
export const TRASH_TITLE = 'Шлюз'
export const TRASH_NOTE = 'брось резко или опусти сюда помехи'

/** Помехи распознаются без знания предметной области: это шум, а не спорное решение. */
export const IDEAS: readonly ChallengeIdea[] = [
  { id: 'reactor', text: 'Реактор на 80 %', target: 'power' },
  { id: 'uplink', text: 'Канал с бортом', target: 'comms' },
  { id: 'sunspot', text: 'Помеха от вспышки', target: 'trash' },
  { id: 'oxygen', text: 'Кислород в норме', target: 'life' },
  { id: 'battery', text: 'Резерв батарей', target: 'power' },
  { id: 'docking', text: 'Запрос на стыковку', target: 'comms' },
  { id: 'filters', text: 'Фильтры воздуха', target: 'life' },
  { id: 'echo', text: 'Эхо старого сигнала', target: 'trash' },
  { id: 'relay', text: 'Ретранслятор поднят', target: 'comms' },
  { id: 'coolant', text: 'Перегрев контура', target: 'power' },
  { id: 'noise', text: 'Шум датчика', target: 'trash' },
  { id: 'pressure', text: 'Давление в шлюзе', target: 'life' },
]

const ID_PREFIX = 'ch-'
const PILE_COLS = 6
const PILE_X0 = -640
const PILE_STEP_X = 160
const PILE_ROWS_Y: readonly number[] = [80, 235]
const TILT_DEG: readonly number[] = [-4, 3, -2, 4, -3, 2]
/** Сколько задач в проверке: 12 идей и одна добавленная. */
export const CHECKS_TOTAL = IDEAS.length + 1

export const ideaElementId = (idea: ChallengeIdea): string => `${ID_PREFIX}${idea.id}`

const SEED_IDS: ReadonlySet<string> = new Set(IDEAS.map(ideaElementId))

export interface SeedSpec {
  readonly id: string
  readonly text: string
  readonly x: number
  readonly y: number
  readonly rotation: number
  readonly colorIndex: number
}

/** Стартовая куча стикеров: две строки по шесть, лёгкий наклон, цвета вперемешку. */
export function seedLayout(): readonly SeedSpec[] {
  return IDEAS.map((idea, i) => ({
    id: ideaElementId(idea),
    text: idea.text,
    x: PILE_X0 + (i % PILE_COLS) * PILE_STEP_X,
    y: PILE_ROWS_Y[Math.floor(i / PILE_COLS)] ?? 0,
    rotation: TILT_DEG[i % TILT_DEG.length] ?? 0,
    colorIndex: (i * 2) % 5,
  }))
}

/** Зум камеры, при котором раскладка целиком помещается в экран. */
export const fitZoom = (vw: number, vh: number): number => Math.min(vw / LAYOUT_W, vh / LAYOUT_H)

export const clusterOf = (el: Placed): Cluster | undefined => CLUSTERS.find((c) => centerIn(c.rect, el))

export const inTrash = (el: Placed): boolean => centerIn(TRASH, el)

/** Элемент чуть не донесён до кластера: краем в зоне, центр снаружи. */
export const nearMissCluster = (el: Placed): boolean =>
  !clusterOf(el) && CLUSTERS.some((c) => touchesEdge(c.rect, el))

export function evaluate(elements: readonly CheckedElement[]): Evaluation {
  const byId = new Map(elements.map((e) => [e.id, e]))
  let placed = 0
  let discarded = 0
  IDEAS.forEach((idea) => {
    const el = byId.get(ideaElementId(idea))
    if (idea.target === 'trash') discarded += el ? 0 : 1
    else if (el && clusterOf(el)?.id === idea.target) placed += 1
  })
  const added = elements.some((e) => !SEED_IDS.has(e.id) && clusterOf(e) !== undefined)
  const correct = placed + discarded + (added ? 1 : 0)
  const accuracy = Math.round((100 * correct) / CHECKS_TOTAL)
  return { placed, discarded, added, correct, total: CHECKS_TOTAL, accuracy, perfect: correct === CHECKS_TOTAL }
}

export function progress(elements: readonly CheckedElement[]): ChallengeProgress {
  const present = new Set(elements.map((e) => e.id))
  const removed = [...SEED_IDS].filter((id) => !present.has(id)).length
  const inClusters = elements.filter((e) => clusterOf(e) !== undefined).length
  const added = elements.some((e) => !SEED_IDS.has(e.id) && clusterOf(e) !== undefined)
  return { inClusters, removed, added }
}

export const SCORE_PER_PERCENT = 10
export const SCORE_PER_SECOND_LEFT = 2
export const SCORE_PER_HINT = 5

/**
 * Очки: точность важнее всего. Бонус за оставшееся время умножается на точность,
 * чтобы нельзя было набрать очки, сразу нажав «Готово». Подсказки немного снижают счёт.
 */
export function scoreOf(accuracy: number, elapsedMs: number, hints: number, limitMs = CHALLENGE_LIMIT_MS): number {
  const secondsLeft = Math.max(0, Math.round((limitMs - elapsedMs) / 1000))
  const timeBonus = Math.round((secondsLeft * SCORE_PER_SECOND_LEFT * accuracy) / 100)
  const raw = accuracy * SCORE_PER_PERCENT + timeBonus - hints * SCORE_PER_HINT
  return Math.max(0, raw)
}

export const timeLeft = (elapsedMs: number, limitMs = CHALLENGE_LIMIT_MS): number => Math.max(0, limitMs - elapsedMs)

/** 83500 → «1:23». */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export const CHALLENGE_HINTS = {
  NEAR_MISS: {
    code: 'CH_NEAR_MISS',
    message: 'Опусти стикер глубже в зону: внутри рамки должен быть его центр',
    severity: 'info',
  },
  TIME_LOW: { code: 'CH_TIME_LOW', message: 'Осталось 30 секунд, покажи «Готово», когда разложишь', severity: 'info' },
} as const satisfies Record<string, HintEvt>

export const TIME_LOW_MS = 30_000
