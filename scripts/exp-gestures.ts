/** Быстрые эксперименты: набор классов, вес признаков кончиков, k. Печатает только сводку. */
import { readFileSync } from 'node:fs'
import type { Dataset, GestureLabel } from '../src/dataset/protocol'
import { FEATURE_SIZE, handFeatures } from '../src/gestures/features'
import { predictKnn, trainKnn } from '../src/gestures/knn'
import type { Landmarks } from '../src/motion/types'

const data = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as Dataset
const toLm = (pts: readonly (readonly number[])[]): Landmarks => pts.map(([x = 0, y = 0, z = 0]) => ({ x, y, z }))
const LOCAL = 63

function run(drop: readonly GestureLabel[], pairWeight: number, k: number, th: number): string {
  const rows = data.samples
    .filter((s) => !drop.includes(s.label))
    .map((s) => {
      const f = handFeatures(toLm(s.world), s.handLabel)
      return { round: s.round, cls: s.label === 'none' || s.label === 'relaxed' ? 'idle' : s.label, f }
    })
  const train = rows.filter((r) => r.round === 0)
  const test = rows.filter((r) => r.round === 1)
  const model = trainKnn(train.map((r) => r.f), train.map((r) => r.cls), k)
  // Вес признаков применяется после стандартизации: масштабируем стандартные отклонения.
  const std = model.std.map((s, j) => (j >= LOCAL ? s / pairWeight : s))
  const m = { ...model, std, points: train.map((r) => r.f.map((v, j) => (v - model.mean[j]!) / std[j]!)) }
  const by = new Map<string, { ok: number; n: number }>()
  let idleFalse = 0
  let idleN = 0
  for (const r of test) {
    const p = predictKnn(m, r.f)
    const pred = p.confidence >= th ? p.label : 'idle'
    const e = by.get(r.cls) ?? { ok: 0, n: 0 }
    by.set(r.cls, { ok: e.ok + (pred === r.cls ? 1 : 0), n: e.n + 1 })
    if (r.cls === 'idle') {
      idleN++
      if (pred !== 'idle') idleFalse++
    }
  }
  const rec = [...by.entries()].map(([c, v]) => `${c} ${((v.ok / v.n) * 100).toFixed(0)}`).join(', ')
  return `drop=[${drop}] w=${pairWeight} k=${k} th=${th} | ложные на idle ${((idleFalse / idleN) * 100).toFixed(1)}% | ${rec}`
}

console.log('features', FEATURE_SIZE)
for (const drop of [[], ['thumb']] as GestureLabel[][]) {
  for (const w of [1, 3, 6]) {
    for (const k of [7, 15]) console.log(run(drop, w, k, 0.75))
  }
}
