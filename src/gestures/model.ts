import type { Landmarks } from '../motion/types'
import { handFeatures } from './features'
import { predictKnn, trainKnn, type KnnModel } from './knn'

/**
 * Классификатор позы руки на kNN, обученный на записанном датасете. Файл модели — признаки и метки
 * кадров, среднее и разброс считаются при загрузке. Классы-поглотители (большой палец)
 * забирают на себя похожие полусогнутые позы и на выходе считаются бездействием.
 *
 * Щипок — поза зума: сомкнутый щипок, ведомый вверх или вниз, масштабирует доску. Захват — только
 * кулак: когда щипок тоже брал, зум одной рукой было не отличить от попытки взять элемент.
 */

export type Pose = 'idle' | 'open' | 'fist' | 'pinch' | 'point' | 'victory'

export interface RawPose {
  readonly label: Pose
  readonly confidence: number
}

export interface GestureModelFile {
  readonly version: 1
  readonly k: number
  /** Метки, ответ которых считается idle. */
  readonly absorb: readonly string[]
  readonly labels: readonly string[]
  readonly features: readonly (readonly number[])[]
}

/** Как достать файл модели. Подменяется счётчиком загрузки, чтобы эти 2 МБ попали в индикатор. */
export type FetchBytes = (url: string) => Promise<Uint8Array>

const plainFetch: FetchBytes = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Модель жестов не загрузилась: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * Расстояние между кончиками большого и указательного, отнесённое к длине ладони 0→9. По записям:
 * настоящий щипок почти всегда уже 0.64 (95-й перцентиль), раскрытая ладонь почти всегда шире 0.71 (5-й).
 */
export const PINCH_MAX_TIP_GAP = 0.7

export function tipGap(world: Landmarks): number {
  const d = (i: number, j: number): number => {
    const a = world[i]
    const b = world[j]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : 0
  }
  const palm = d(0, 9)
  return palm > 0 ? d(4, 8) / palm : Infinity
}

const POSES: ReadonlySet<string> = new Set<Pose>(['idle', 'open', 'fist', 'pinch', 'point', 'victory'])
const toPose = (label: string, absorb: ReadonlySet<string>): Pose =>
  absorb.has(label) || !POSES.has(label) ? 'idle' : (label as Pose)

export class GestureClassifier {
  private constructor(
    private readonly model: KnnModel<string>,
    private readonly absorb: ReadonlySet<string>,
  ) {}

  static fromFile(file: GestureModelFile): GestureClassifier {
    return new GestureClassifier(trainKnn(file.features, file.labels, file.k), new Set(file.absorb))
  }

  static async load(url: string, fetchBytes: FetchBytes = plainFetch): Promise<GestureClassifier> {
    const bytes = await fetchBytes(url)
    return GestureClassifier.fromFile(JSON.parse(new TextDecoder().decode(bytes)) as GestureModelFile)
  }

  classify(world: Landmarks, handLabel: string): RawPose {
    const p = predictKnn(this.model, handFeatures(world, handLabel))
    const label = toPose(p.label, this.absorb)
    // Страховка от ложного зума: щипок без сомкнутых кончиков — это раскрытая или расслабленная рука.
    if (label === 'pinch' && tipGap(world) >= PINCH_MAX_TIP_GAP) return { label: 'idle', confidence: p.confidence }
    return { label, confidence: p.confidence }
  }
}
