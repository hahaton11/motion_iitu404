import type { Landmarks, Vec3 } from '../motion/types'

/**
 * Признаки формы руки для классификатора. Метрические точки MediaPipe переводятся в систему координат
 * ладони: начало в запястье, ось y к основанию среднего пальца, ось x к основанию мизинца, масштаб по
 * длине ладони. Так признаки не зависят от поворота кисти, расстояния до камеры и левая это рука или правая.
 */

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }
const at = (lm: Landmarks, i: number): Vec3 => lm[i] ?? ORIGIN
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
const unit = (a: Vec3): Vec3 => {
  const l = len(a) || 1
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

const WRIST = 0
const INDEX_MCP = 5
const MIDDLE_MCP = 9
const PINKY_MCP = 17
const TIPS = [4, 8, 12, 16, 20] as const
/** Пары кончиков, расстояние между которыми различает щипок, V и кулак. */
const TIP_PAIRS: readonly (readonly [number, number])[] = [
  [4, 8],
  [4, 12],
  [8, 12],
  [12, 16],
  [16, 20],
  [4, 5],
]

/** Базис ладони. mirror = true для левой руки, чтобы обе руки давали одинаковые признаки. */
function palmBasis(w: Landmarks, mirror: boolean): { o: Vec3; ex: Vec3; ey: Vec3; ez: Vec3; scale: number } {
  const o = at(w, WRIST)
  const up = sub(at(w, MIDDLE_MCP), o)
  const side = sub(at(w, PINKY_MCP), at(w, INDEX_MCP))
  const ey = unit(up)
  const ez0 = unit(cross(side, up))
  const ez = mirror ? { x: -ez0.x, y: -ez0.y, z: -ez0.z } : ez0
  const ex = unit(cross(ey, ez))
  return { o, ex, ey, ez, scale: len(up) || 1 }
}

export const FEATURE_SIZE = 21 * 3 + TIP_PAIRS.length + TIPS.length

/** Вектор признаков одной руки. handLabel — метка MediaPipe 'Left' или 'Right'. */
export function handFeatures(world: Landmarks, handLabel: string): number[] {
  const b = palmBasis(world, handLabel.toLowerCase() === 'left')
  const local = world.flatMap((p) => {
    const d = sub(p, b.o)
    return [dot(d, b.ex) / b.scale, dot(d, b.ey) / b.scale, dot(d, b.ez) / b.scale]
  })
  const pairs = TIP_PAIRS.map(([i, j]) => len(sub(at(world, i), at(world, j))) / b.scale)
  const reach = TIPS.map((i) => len(sub(at(world, i), b.o)) / b.scale)
  return [...local, ...pairs, ...reach]
}
