/** Собирает public/models/gestures-knn.json из датасета: все кадры обоих кругов. */
import { readFileSync, writeFileSync } from 'node:fs'
import type { Dataset } from '../src/dataset/protocol'
import { handFeatures } from '../src/gestures/features'
import type { GestureModelFile } from '../src/gestures/model'
import type { Landmarks } from '../src/motion/types'

const [src, out = 'public/models/gestures-knn.json'] = process.argv.slice(2)
if (!src) throw new Error('usage: tsx scripts/build-gesture-model.ts data/gestures.json [out]')
const data = JSON.parse(readFileSync(src, 'utf8')) as Dataset
const toLm = (pts: readonly (readonly number[])[]): Landmarks => pts.map(([x = 0, y = 0, z = 0]) => ({ x, y, z }))
const round3 = (v: number): number => Math.round(v * 1e3) / 1e3
const label = (l: string): string => (l === 'none' || l === 'relaxed' ? 'idle' : l)
const file: GestureModelFile = {
  version: 1,
  k: 7,
  absorb: ['thumb'],
  labels: data.samples.map((s) => label(s.label)),
  features: data.samples.map((s) => handFeatures(toLm(s.world), s.handLabel).map(round3)),
}
writeFileSync(out, JSON.stringify(file))
console.log(`${out}: ${file.labels.length} кадров`)
