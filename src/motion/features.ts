import {
  FINGER_CHAINS,
  FINGER_CURLED_MIN,
  FINGER_EXTENDED_MAX,
  FRAME_ASPECT,
  FULL_CURL_RAD,
  MIDDLE_MCP,
  WRIST,
} from './constants'
import { palmCenter } from './landmarks'
import type { HandDetection, Landmarks, Vec2, Vec3 } from './types'

export type FingerName = keyof typeof FINGER_CHAINS

export type FingerCurlMap = Readonly<Record<FingerName, number>>

export interface HandFeatures {
  /** Сгибание каждого пальца 0..1. */
  readonly curls: FingerCurlMap
  /** 0 = ладонь раскрыта, 1 = кулак. Среднее по четырём пальцам без большого. */
  readonly closure: number
  /** Вытянут только указательный, остальные три согнуты. */
  readonly indexOnly: boolean
  /** Длина 0→9 в долях высоты кадра. */
  readonly palmSize: number
  /** Центр ладони в координатах кадра, не зеркальный. */
  readonly center: Vec2
}

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }
const at = (lm: Landmarks, i: number): Vec3 => lm[i] ?? ORIGIN
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** Угол между двумя векторами в радианах. Для нулевого вектора 0. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const la = Math.hypot(a.x, a.y, a.z)
  const lb = Math.hypot(b.x, b.y, b.z)
  if (la === 0 || lb === 0) return 0
  const cos = (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb)
  return Math.acos(Math.min(1, Math.max(-1, cos)))
}

/** Сгибание пальца: сумма углов трёх суставов, отнесённая к полному сжатию. */
export function fingerCurl(world: Landmarks, chain: readonly number[]): number {
  const pts = [WRIST, ...chain].map((i) => at(world, i))
  let total = 0
  for (let i = 2; i < pts.length; i++) {
    total += angleBetween(sub(pts[i - 1]!, pts[i - 2]!), sub(pts[i]!, pts[i - 1]!))
  }
  return clamp01(total / FULL_CURL_RAD)
}

export function fingerCurls(world: Landmarks): FingerCurlMap {
  return {
    thumb: fingerCurl(world, FINGER_CHAINS.thumb),
    index: fingerCurl(world, FINGER_CHAINS.index),
    middle: fingerCurl(world, FINGER_CHAINS.middle),
    ring: fingerCurl(world, FINGER_CHAINS.ring),
    pinky: fingerCurl(world, FINGER_CHAINS.pinky),
  }
}

export function closureOf(c: FingerCurlMap): number {
  return (c.index + c.middle + c.ring + c.pinky) / 4
}

export function isIndexOnly(c: FingerCurlMap): boolean {
  const othersCurled = [c.middle, c.ring, c.pinky].every((v) => v > FINGER_CURLED_MIN)
  return c.index < FINGER_EXTENDED_MAX && othersCurled
}

/** Размер ладони по длине 0→9 в долях высоты кадра. */
export function palmSize(lm: Landmarks, aspect: number = FRAME_ASPECT): number {
  const w = at(lm, WRIST)
  const m = at(lm, MIDDLE_MCP)
  return Math.hypot((m.x - w.x) * aspect, m.y - w.y)
}

export function computeFeatures(det: HandDetection): HandFeatures {
  const curls = fingerCurls(det.world)
  return {
    curls,
    closure: closureOf(curls),
    indexOnly: isIndexOnly(curls),
    palmSize: palmSize(det.landmarks),
    center: palmCenter(det.landmarks),
  }
}
