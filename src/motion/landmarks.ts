import type { HandId } from '../contracts/input'
import { EDGE_DEAD_ZONE, MIDDLE_MCP, PALM_POINTS, SWAP_HANDEDNESS, WRIST } from './constants'
import type { HandDetection, Landmarks, Vec2, Vec3 } from './types'

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }
const at = (lm: Landmarks, i: number): Vec3 => lm[i] ?? ORIGIN
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** Центр ладони как среднее запястья и оснований пальцев: не уходит при сжатии кулака. */
export function palmCenter(lm: Landmarks): Vec2 {
  const pts = PALM_POINTS.map((i) => at(lm, i))
  const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / pts.length, y: sum.y / pts.length }
}

/** Начало координат в запястье, масштаб по длине 0→9, зеркальный x. Возвращает новый массив. */
export function normalizeLandmarks(lm: Landmarks): Landmarks {
  const w = at(lm, WRIST)
  const m = at(lm, MIDDLE_MCP)
  const len = Math.hypot(m.x - w.x, m.y - w.y, m.z - w.z) || 1
  return lm.map((p) => ({ x: -(p.x - w.x) / len, y: (p.y - w.y) / len, z: (p.z - w.z) / len }))
}

/**
 * Точка кадра → точка экрана: зеркальный x, мёртвая зона по краям кадра растягивается на весь экран,
 * чтобы до краёв экрана можно было дотянуться, не выводя руку из кадра.
 */
export function frameToScreen(p: Vec2, deadZone: number = EDGE_DEAD_ZONE): Vec2 {
  const span = 1 - 2 * deadZone
  const stretch = (v: number): number => clamp01((v - deadZone) / span)
  return { x: stretch(1 - p.x), y: stretch(p.y) }
}

/** Расстояние от точки до ближайшего края кадра. */
export function edgeDistance(p: Vec2): number {
  return Math.min(p.x, 1 - p.x, p.y, 1 - p.y)
}

/** Сырая рука из MediaPipe до назначения идентификатора. */
export interface RawHand {
  readonly label: string
  readonly score: number
  readonly landmarks: Landmarks
  readonly world: Landmarks
}

function labelToHand(label: string): HandId {
  const isLeft = label.toLowerCase() === 'left'
  return isLeft !== SWAP_HANDEDNESS ? 'left' : 'right'
}

/**
 * Назначает руки 'left' и 'right' по handedness. Если модель дала обеим рукам одну метку,
 * решает по положению: левая на экране та, что левее после зеркалирования.
 */
export function assignHandIds(raw: readonly RawHand[]): HandDetection[] {
  const hands = raw.map((r) => ({ hand: labelToHand(r.label), landmarks: r.landmarks, world: r.world, score: r.score }))
  const [a, b] = hands
  if (!a || !b || a.hand !== b.hand) return hands.slice(0, 2)
  const ax = frameToScreen(palmCenter(a.landmarks), 0).x
  const bx = frameToScreen(palmCenter(b.landmarks), 0).x
  const aLeft = ax <= bx
  return [
    { ...a, hand: aLeft ? 'left' : 'right' },
    { ...b, hand: aLeft ? 'right' : 'left' },
  ]
}
