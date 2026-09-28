import type { HandId } from '../../contracts/input'
import { FRAME_ASPECT, FULL_CURL_RAD } from '../constants'
import type { HandDetection, Landmarks, Vec3 } from '../types'

/**
 * Генератор синтетических поз руки для тестов. Плоская модель: пальцы лежат в плоскости xy,
 * при сгибании поворачиваются к ладони по оси z. Координаты мира в метрах, ось y вниз, как в кадре.
 */

export interface FingerCurls {
  readonly thumb: number
  readonly index: number
  readonly middle: number
  readonly ring: number
  readonly pinky: number
}

export interface PoseOptions {
  readonly hand?: HandId
  /** Центр запястья в координатах кадра 0..1. */
  readonly wrist?: { readonly x: number; readonly y: number }
  /** Сколько долей ширины кадра приходится на метр. */
  readonly scale?: number
  readonly score?: number
}

interface FingerModel {
  readonly angleDeg: number
  readonly baseLen: number
  readonly bones: readonly [number, number, number]
}

/** Направление пальца: 0° строго вверх, отрицательные углы к большому пальцу. */
const FINGERS: Record<keyof FingerCurls, FingerModel> = {
  thumb: { angleDeg: -55, baseLen: 0.03, bones: [0.035, 0.03, 0.025] },
  index: { angleDeg: -12, baseLen: 0.09, bones: [0.04, 0.025, 0.02] },
  middle: { angleDeg: 0, baseLen: 0.09, bones: [0.045, 0.028, 0.022] },
  ring: { angleDeg: 10, baseLen: 0.085, bones: [0.04, 0.026, 0.02] },
  pinky: { angleDeg: 22, baseLen: 0.075, bones: [0.032, 0.02, 0.018] },
}

const ORDER: readonly (keyof FingerCurls)[] = ['thumb', 'index', 'middle', 'ring', 'pinky']
/** Доли полного сгибания, приходящиеся на суставы MCP, PIP, DIP. */
const JOINT_SHARE = [0.35, 0.4, 0.25] as const
const DEFAULT_SCALE = 0.8
const DEG = Math.PI / 180

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const mul = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })

function fingerPoints(model: FingerModel, curl: number): Vec3[] {
  const dir: Vec3 = { x: Math.sin(model.angleDeg * DEG), y: -Math.cos(model.angleDeg * DEG), z: 0 }
  const toPalm: Vec3 = { x: 0, y: 0, z: -1 }
  const base = mul(dir, model.baseLen)
  const points: Vec3[] = [base]
  let theta = 0
  let cur = base
  model.bones.forEach((len, i) => {
    theta += curl * FULL_CURL_RAD * (JOINT_SHARE[i] ?? 0)
    const seg = add(mul(dir, Math.cos(theta)), mul(toPalm, Math.sin(theta)))
    cur = add(cur, mul(seg, len))
    points.push(cur)
  })
  return points
}

/** Метрические точки руки, запястье в начале координат. */
export function worldPose(curls: FingerCurls): Landmarks {
  const wrist: Vec3 = { x: 0, y: 0, z: 0 }
  return [wrist, ...ORDER.flatMap((f) => fingerPoints(FINGERS[f], curls[f]))]
}

/** Полная детекция: мировые точки и их проекция в кадр. */
export function syntheticHand(curls: FingerCurls, opts: PoseOptions = {}): HandDetection {
  const world = worldPose(curls)
  const wrist = opts.wrist ?? { x: 0.5, y: 0.75 }
  const scale = opts.scale ?? DEFAULT_SCALE
  const landmarks = world.map((p) => ({ x: wrist.x + p.x * scale, y: wrist.y + p.y * scale * FRAME_ASPECT, z: p.z }))
  return { hand: opts.hand ?? 'right', landmarks, world, score: opts.score ?? 0.95 }
}

const uniform = (c: number): FingerCurls => ({ thumb: c, index: c, middle: c, ring: c, pinky: c })

export const POSES = {
  open: uniform(0),
  fist: uniform(1),
  half: uniform(0.6),
  point: { thumb: 0.8, index: 0, middle: 1, ring: 1, pinky: 1 },
  pinch: { thumb: 0.5, index: 0.5, middle: 0.05, ring: 0.05, pinky: 0.05 },
  curl: uniform,
} as const
