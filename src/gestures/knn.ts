/**
 * k ближайших соседей со стандартизацией признаков. Маленький датасет, 70 признаков: работает в браузере
 * за доли миллисекунды на кадр. Уверенность — доля голосов победившего класса среди k соседей,
 * взвешенных обратным расстоянием.
 */

export interface KnnModel<L extends string> {
  readonly k: number
  readonly mean: readonly number[]
  readonly std: readonly number[]
  readonly points: readonly (readonly number[])[]
  readonly labels: readonly L[]
}

export interface Prediction<L extends string> {
  readonly label: L
  readonly confidence: number
}

function stats(rows: readonly (readonly number[])[]): { mean: number[]; std: number[] } {
  const n = rows.length
  const dim = rows[0]?.length ?? 0
  const mean = Array.from({ length: dim }, (_, j) => rows.reduce((s, r) => s + (r[j] ?? 0), 0) / n)
  const std = mean.map((m, j) => Math.sqrt(rows.reduce((s, r) => s + ((r[j] ?? 0) - m) ** 2, 0) / n) || 1)
  return { mean, std }
}

const standardize = (x: readonly number[], mean: readonly number[], std: readonly number[]): number[] =>
  x.map((v, j) => (v - (mean[j] ?? 0)) / (std[j] ?? 1))

export function trainKnn<L extends string>(rows: readonly (readonly number[])[], labels: readonly L[], k = 7): KnnModel<L> {
  const { mean, std } = stats(rows)
  return { k, mean, std, points: rows.map((r) => standardize(r, mean, std)), labels }
}

export function predictKnn<L extends string>(m: KnnModel<L>, x: readonly number[]): Prediction<L> {
  const q = standardize(x, m.mean, m.std)
  const best: { d: number; i: number }[] = []
  m.points.forEach((p, i) => {
    let d = 0
    for (let j = 0; j < q.length; j++) d += ((p[j] ?? 0) - (q[j] ?? 0)) ** 2
    if (best.length < m.k || d < best[best.length - 1]!.d) {
      best.push({ d, i })
      best.sort((a, b) => a.d - b.d)
      if (best.length > m.k) best.pop()
    }
  })
  const votes = new Map<L, number>()
  let total = 0
  best.forEach(({ d, i }) => {
    const w = 1 / (Math.sqrt(d) + 1e-3)
    const label = m.labels[i]!
    votes.set(label, (votes.get(label) ?? 0) + w)
    total += w
  })
  let label = m.labels[0]!
  let top = -1
  votes.forEach((v, l) => {
    if (v > top) {
      top = v
      label = l
    }
  })
  return { label, confidence: total > 0 ? top / total : 0 }
}
