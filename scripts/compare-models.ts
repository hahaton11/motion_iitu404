/**
 * Сравнение моделей на отложенном круге новой записи: обучение на базовых записях
 * против базовых плюс первый круг новой. Запуск:
 * npx tsx scripts/compare-models.ts data/new.json data/base1.json [data/base2.json ...]
 */
import { readFileSync } from 'node:fs'
import type { Dataset, Sample } from '../src/dataset/protocol'
import { handFeatures } from '../src/gestures/features'
import { predictKnn, trainKnn } from '../src/gestures/knn'
import { PINCH_MAX_TIP_GAP, tipGap } from '../src/gestures/model'
import type { Landmarks } from '../src/motion/types'

const [fresh, ...bases] = process.argv.slice(2)
if (!fresh || bases.length === 0) throw new Error('usage: compare-models.ts new.json base.json [...]')
/** data/x.json#-pinch исключает классы записи, как в build-gesture-model. */
const load = (arg: string): readonly Sample[] => {
  const [f = '', drop = ''] = arg.split('#-')
  const skip = new Set(drop.split(',').filter(Boolean))
  return (JSON.parse(readFileSync(f, 'utf8')) as Dataset).samples.filter((s) => !skip.has(s.label))
}
const toLm = (pts: readonly (readonly number[])[]): Landmarks => pts.map(([x = 0, y = 0, z = 0]) => ({ x, y, z }))
const cls = (l: string): string => (l === 'none' || l === 'relaxed' ? 'idle' : l)
const ABSORB = new Set(['thumb'])
const feat = (s: Sample) => ({ cls: cls(s.label), f: handFeatures(toLm(s.world), s.handLabel), gap: tipGap(toLm(s.world)) })

const base = bases.flatMap(load).map(feat)
const newSamples = load(fresh)
const extra = newSamples.filter((s) => s.round === 0).map(feat)
const test = newSamples.filter((s) => s.round === 1).map(feat)

function evaluate(name: string, train: readonly { cls: string; f: number[] }[]): void {
  const veto = process.env.VETO !== '0'
  const m = trainKnn(train.map((r) => r.f), train.map((r) => r.cls), 7)
  const table = new Map<string, Map<string, number>>()
  for (const r of test) {
    const p = predictKnn(m, r.f)
    const vetoed = veto && p.label === 'pinch' && r.gap >= PINCH_MAX_TIP_GAP
    const label = p.confidence < 0.75 || ABSORB.has(p.label) || vetoed ? 'idle' : p.label
    const row = table.get(r.cls) ?? new Map<string, number>()
    row.set(label, (row.get(label) ?? 0) + 1)
    table.set(r.cls, row)
  }
  console.log(`\n## ${name}: ${train.length} кадров обучения`)
  for (const [truth, row] of table) {
    const total = [...row.values()].reduce((a, b) => a + b, 0)
    const parts = [...row.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${((n / total) * 100).toFixed(1)}%`)
    console.log(`${truth.padEnd(6)} (${total}): ${parts.join(', ')}`)
  }
}

evaluate('текущая модель: только базовые записи', base)
evaluate('новая модель: базовые + первый круг новой записи', [...base, ...extra])
