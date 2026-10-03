/**
 * Распределение размера ладони по записанным кадрам — тем же `computeFeatures`, которым его меряет
 * детектор подсказок. Нужен, чтобы пороги `PALM_SIZE_MIN` и `PALM_SIZE_MAX` стояли по замеру
 * на реальной дистанции работы, а не по догадке: подсказка «отойди на шаг назад», которая висит
 * у человека, стоящего нормально, — ложная, а ложная подсказка хуже отсутствующей.
 *
 * Запуск: npx tsx scripts/measure-palm-size.ts data/gestures-v3.json [...ещё файлы]
 */
import { readFileSync } from 'node:fs'
import type { Dataset } from '../src/dataset/protocol'
import { palmSize } from '../src/motion/features'
import { PALM_SIZE_MAX, PALM_SIZE_MIN } from '../src/motion/constants'
import type { Landmarks } from '../src/motion/types'

const toLm = (pts: readonly (readonly number[])[]): Landmarks => pts.map(([x = 0, y = 0, z = 0]) => ({ x, y, z }))

const quantile = (sorted: readonly number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0

const files = process.argv.slice(2)
if (files.length === 0) throw new Error('укажи один или несколько файлов датасета')

const all: number[] = []

for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8')) as Dataset
  const sizes = data.samples.map((s) => palmSize(toLm(s.lm)))
  all.push(...sizes)
  const sorted = [...sizes].sort((a, b) => a - b)
  const over = sizes.filter((v) => v > PALM_SIZE_MAX).length
  const under = sizes.filter((v) => v < PALM_SIZE_MIN).length
  const ua = data.userAgent.includes('Macintosh') ? 'Mac' : data.userAgent.includes('Windows') ? 'Windows' : '?'
  console.log(`\n${file}  (${ua}, ${sizes.length} кадров)`)
  console.log(`  p5 ${quantile(sorted, 0.05).toFixed(3)}  медиана ${quantile(sorted, 0.5).toFixed(3)}  p95 ${quantile(sorted, 0.95).toFixed(3)}  max ${quantile(sorted, 1).toFixed(3)}`)
  console.log(`  выше PALM_SIZE_MAX (${PALM_SIZE_MAX}): ${((over / sizes.length) * 100).toFixed(1)} %   ниже PALM_SIZE_MIN (${PALM_SIZE_MIN}): ${((under / sizes.length) * 100).toFixed(1)} %`)
}

if (files.length > 1) {
  const sorted = all.sort((a, b) => a - b)
  const over = all.filter((v) => v > PALM_SIZE_MAX).length
  console.log(`\nвсе файлы вместе (${all.length} кадров)`)
  console.log(`  p5 ${quantile(sorted, 0.05).toFixed(3)}  медиана ${quantile(sorted, 0.5).toFixed(3)}  p95 ${quantile(sorted, 0.95).toFixed(3)}  p99 ${quantile(sorted, 0.99).toFixed(3)}  max ${quantile(sorted, 1).toFixed(3)}`)
  console.log(`  выше PALM_SIZE_MAX (${PALM_SIZE_MAX}): ${((over / all.length) * 100).toFixed(1)} %`)
}
