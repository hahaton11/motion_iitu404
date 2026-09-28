import type { Landmarks } from '../motion/types'
import { handFeatures } from './features'
import { predictKnn, trainKnn, type KnnModel } from './knn'

/**
 * Классификатор позы руки на kNN, обученный на записанном датасете. Файл модели — признаки и метки
 * кадров, среднее и разброс считаются при загрузке. Классы-поглотители (щипок, большой палец)
 * забирают на себя похожие полусогнутые позы и на выходе считаются бездействием.
 */

export type Pose = 'idle' | 'open' | 'fist' | 'point' | 'victory'

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

const POSES: ReadonlySet<string> = new Set<Pose>(['idle', 'open', 'fist', 'point', 'victory'])
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

  static async load(url: string): Promise<GestureClassifier> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Модель жестов не загрузилась: ${res.status}`)
    return GestureClassifier.fromFile((await res.json()) as GestureModelFile)
  }

  classify(world: Landmarks, handLabel: string): RawPose {
    const p = predictKnn(this.model, handFeatures(world, handLabel))
    return { label: toPose(p.label, this.absorb), confidence: p.confidence }
  }
}
