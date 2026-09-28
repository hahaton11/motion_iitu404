/**
 * Протокол записи датасета жестов. Каждый класс: подготовка, затем запись. Весь круг проходится дважды:
 * первый круг — обучение, второй — отложенная проверка, чтобы точность считалась честно.
 * Классы none и relaxed — негативные: система должна молчать, это True Negative.
 */

export type GestureLabel = 'none' | 'relaxed' | 'open' | 'fist' | 'pinch' | 'point' | 'victory' | 'thumb'

export interface ProtocolStep {
  readonly label: GestureLabel
  readonly title: string
  readonly instruction: string
  readonly recordMs: number
}

export const PREP_MS = 3000
export const ROUNDS = 2

export const STEPS: readonly ProtocolStep[] = [
  {
    label: 'none',
    title: 'Ничего не делай',
    instruction: 'Веди себя естественно: опусти руку, почеши голову, потянись к мышке, поправь волосы. Рука должна мелькать в кадре',
    recordMs: 15000,
  },
  {
    label: 'relaxed',
    title: 'Расслабленная рука',
    instruction: 'Держи руку перед камерой расслабленно, как будто просто ждёшь. Пальцы полусогнуты, двигай ей немного',
    recordMs: 10000,
  },
  { label: 'open', title: 'Открытая ладонь', instruction: 'Ладонь к камере, пальцы врозь. Медленно води рукой и поворачивай кисть', recordMs: 10000 },
  { label: 'fist', title: 'Кулак', instruction: 'Сожми кулак. Води им и слегка поворачивай', recordMs: 10000 },
  {
    label: 'pinch',
    title: 'Щипок',
    instruction: 'Большой и указательный касаются кончиками, остальные пальцы свободно. Води рукой',
    recordMs: 10000,
  },
  { label: 'point', title: 'Указательный', instruction: 'Вытяни указательный, остальные согни. Води рукой', recordMs: 10000 },
  { label: 'victory', title: 'Жест V', instruction: 'Указательный и средний вытянуты, остальные согнуты. Води рукой', recordMs: 10000 },
  { label: 'thumb', title: 'Большой палец вверх', instruction: 'Кулак с поднятым большим пальцем. Води рукой', recordMs: 10000 },
]

export interface Sample {
  readonly label: GestureLabel
  readonly round: number
  readonly t: number
  readonly handLabel: string
  readonly score: number
  /** 21 точка кадра и 21 метрическая точка, каждая [x, y, z], округлено до 4 знаков. */
  readonly lm: readonly (readonly number[])[]
  readonly world: readonly (readonly number[])[]
}

export interface Dataset {
  readonly version: 1
  readonly recordedAt: string
  readonly userAgent: string
  readonly samples: readonly Sample[]
}

export type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'prep' | 'record'; readonly round: number; readonly step: number; readonly since: number }
  | { readonly kind: 'done' }

/** Следующая фаза по времени. Чистая функция для тестов. */
export function advance(p: Phase, t: number): Phase {
  if (p.kind !== 'prep' && p.kind !== 'record') return p
  const step = STEPS[p.step]
  if (!step) return { kind: 'done' }
  if (p.kind === 'prep') return t - p.since >= PREP_MS ? { ...p, kind: 'record', since: t } : p
  if (t - p.since < step.recordMs) return p
  const nextStep = p.step + 1
  if (nextStep < STEPS.length) return { kind: 'prep', round: p.round, step: nextStep, since: t }
  return p.round + 1 < ROUNDS ? { kind: 'prep', round: p.round + 1, step: 0, since: t } : { kind: 'done' }
}

export const start = (t: number): Phase => ({ kind: 'prep', round: 0, step: 0, since: t })

export function totalMs(): number {
  return ROUNDS * STEPS.reduce((sum, s) => sum + PREP_MS + s.recordMs, 0)
}
