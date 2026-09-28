import { LANDMARK_COUNT } from './constants'
import { assignHandIds, type RawHand } from './landmarks'
import { initialPipeline, processFrame, type OutEvent } from './pipeline'
import type { Landmarks, TrackerFrame } from './types'

/**
 * Формат записанных последовательностей landmarks в test-assets/fixtures/*.json.
 * Демо сохраняет его кнопкой «Сохранить кадры», тесты прогоняют через pipeline.
 */

type Triple = readonly [number, number, number]

export interface FixtureHand {
  readonly label: string
  readonly score: number
  readonly landmarks: readonly Triple[]
  readonly world: readonly Triple[]
}

export interface FixtureFrame {
  readonly t: number
  readonly hands: readonly FixtureHand[]
}

export interface Fixture {
  readonly name: string
  readonly frames: readonly FixtureFrame[]
  /** Ожидаемые типы событий без cursor и hint, в порядке появления. */
  readonly expected?: readonly string[]
}

const PRECISION = 1e4
const round = (v: number): number => Math.round(v * PRECISION) / PRECISION

const toTriples = (lm: Landmarks): Triple[] => lm.map((p) => [round(p.x), round(p.y), round(p.z)] as const)
const fromTriples = (ts: readonly Triple[]): Landmarks => ts.map(([x, y, z]) => ({ x, y, z }))

export function encodeHand(raw: RawHand): FixtureHand {
  return { label: raw.label, score: round(raw.score), landmarks: toTriples(raw.landmarks), world: toTriples(raw.world) }
}

export function decodeFrame(f: FixtureFrame): TrackerFrame {
  const raw: RawHand[] = f.hands.map((h) => ({
    label: h.label,
    score: h.score,
    landmarks: fromTriples(h.landmarks),
    world: fromTriples(h.world),
  }))
  return { t: f.t, hands: assignHandIds(raw) }
}

const isTriple = (v: unknown): v is Triple => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')

function isHand(v: unknown): v is FixtureHand {
  if (typeof v !== 'object' || v === null) return false
  const h = v as Record<string, unknown>
  const pts = (x: unknown): boolean => Array.isArray(x) && x.length === LANDMARK_COUNT && x.every(isTriple)
  return typeof h.label === 'string' && typeof h.score === 'number' && pts(h.landmarks) && pts(h.world)
}

/** Проверяет JSON из файла. Бросает ошибку с понятной причиной. */
export function parseFixture(json: unknown): Fixture {
  if (typeof json !== 'object' || json === null) throw new Error('Fixture must be an object')
  const f = json as Record<string, unknown>
  if (typeof f.name !== 'string') throw new Error('Fixture needs a name')
  if (!Array.isArray(f.frames)) throw new Error(`Fixture ${f.name}: frames must be an array`)
  f.frames.forEach((fr: unknown, i) => {
    const frame = fr as Record<string, unknown>
    if (typeof frame?.t !== 'number' || !Array.isArray(frame.hands) || !frame.hands.every(isHand)) {
      throw new Error(`Fixture ${f.name}: frame ${i} is malformed`)
    }
  })
  return json as Fixture
}

/** Прогон записи через pipeline. Возвращает все события. */
export function runFixture(fx: Fixture): OutEvent[] {
  let state = initialPipeline()
  return fx.frames.flatMap((f) => {
    const r = processFrame(state, decodeFrame(f))
    state = r.state
    return [...r.events]
  })
}

export const gestureEventTypes = (events: readonly OutEvent[]): string[] =>
  events.filter((e) => e.type !== 'cursor' && e.type !== 'hint').map((e) => e.type)
