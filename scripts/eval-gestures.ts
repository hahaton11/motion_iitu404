/**
 * Оценка распознавания жестов на записанном датасете. Круг 1 — обучение, круг 2 — проверка.
 * Считает матрицу ошибок, precision и recall по классам, влияние порога уверенности и сглаживания
 * по кадрам, и сравнивает с текущими правилами модуля motion. Запуск: npx tsx scripts/eval-gestures.ts data/…json
 */
import { readFileSync } from 'node:fs'
import type { Dataset, GestureLabel } from '../src/dataset/protocol'
import { handFeatures } from '../src/gestures/features'
import { predictKnn, trainKnn } from '../src/gestures/knn'
import type { Pose } from '../src/gestures/model'
import { DEFAULT_VOTER, initialVoter, stepVoter, type BelowThreshold, type VoterParams } from '../src/gestures/voter'
import { closureOf, fingerCurls, isIndexOnly } from '../src/motion/features'
import type { Landmarks } from '../src/motion/types'

type Cls = Exclude<GestureLabel, 'none' | 'relaxed'> | 'idle'
/** Классы, исключённые из набора: DROP=thumb,pinch. */
const DROP = new Set((process.env.DROP ?? '').split(',').filter(Boolean))
/** Классы-поглотители: участвуют в обучении, но их ответ считается idle. ABSORB=thumb,pinch. */
const ABSORB = new Set((process.env.ABSORB ?? '').split(',').filter(Boolean))
const CLASSES: readonly Cls[] = (['idle', 'open', 'fist', 'pinch', 'point', 'victory', 'thumb'] as const).filter((c) => !DROP.has(c))
const toCls = (l: GestureLabel): Cls => (l === 'none' || l === 'relaxed' ? 'idle' : l)
const toLm = (pts: readonly (readonly number[])[]): Landmarks => pts.map(([x = 0, y = 0, z = 0]) => ({ x, y, z }))

/** Только кадры этой руки: HAND=Right. Пусто — обе. */
const HAND = process.env.HAND ?? ''
/**
 * Чем отложенная часть отделена от обучающей.
 * `round` (по умолчанию) — первый круг учит, второй проверяет. Честнее всего, пока оба круга
 *   сняты в одинаковых условиях. Если посреди записи сменилась рука или свет, этот split
 *   померяет перенос между условиями, а не качество распознавания.
 * `time` — внутри каждой группы «класс + круг + рука» первые 70 % кадров учат, последние 30 %
 *   проверяют. Соседние кадры похожи, поэтому цифра выйдет оптимистичнее отложенного круга,
 *   но она хотя бы отвечает на заданный вопрос.
 */
const SPLIT = process.env.SPLIT === 'time' ? 'time' : 'round'
const TRAIN_SHARE = 0.7
/** Параметры голосователя для перебора: THRESHOLD=0.65 GESTURE_NEED=2. */
const envNum = (key: string, fallback: number): number => {
  const v = Number(process.env[key])
  return Number.isFinite(v) && v > 0 ? v : fallback
}
const TUNED: VoterParams = {
  ...DEFAULT_VOTER,
  threshold: envNum('THRESHOLD', DEFAULT_VOTER.threshold),
  gestureNeed: envNum('GESTURE_NEED', DEFAULT_VOTER.gestureNeed),
}

const file = process.argv[2]
if (!file) throw new Error('usage: tsx scripts/eval-gestures.ts data/gestures.json')
const data = JSON.parse(readFileSync(file, 'utf8')) as Dataset
type Row = { s: Dataset['samples'][number]; cls: Cls; f: readonly number[] }
const rows: Row[] = data.samples
  .filter((s) => (!DROP.has(s.label) || ABSORB.has(s.label)) && (!HAND || s.handLabel === HAND))
  .map((s) => ({ s, cls: toCls(s.label), f: handFeatures(toLm(s.world), s.handLabel) }))

function splitByTime(all: readonly Row[]): { train: Row[]; test: Row[] } {
  const groups = new Map<string, Row[]>()
  all.forEach((r) => {
    const key = `${r.s.label}|${r.s.round}|${r.s.handLabel}`
    const g = groups.get(key)
    if (g) g.push(r)
    else groups.set(key, [r])
  })
  const train: Row[] = []
  const test: Row[] = []
  groups.forEach((g) => {
    const sorted = [...g].sort((a, b) => a.s.t - b.s.t)
    const cut = Math.floor(sorted.length * TRAIN_SHARE)
    sorted.forEach((r, i) => (i < cut ? train : test).push(r))
  })
  // Голосователь сбрасывается на смене класса и на разрыве во времени, поэтому отложенная
  // часть идёт классами подряд и по возрастанию времени внутри класса.
  test.sort((a, b) => (a.cls === b.cls ? a.s.t - b.s.t : a.cls.localeCompare(b.cls)))
  return { train, test }
}

const split =
  SPLIT === 'time'
    ? splitByTime(rows)
    : { train: rows.filter((r) => r.s.round === 0), test: rows.filter((r) => r.s.round === 1) }
const train = split.train
const test = split.test.filter((r) => !ABSORB.has(r.cls))
console.log(`split=${SPLIT}${HAND ? ` hand=${HAND}` : ''}: обучение ${train.length} кадров, проверка ${test.length}`)

const model = trainKnn(train.map((r) => r.f), train.map((r) => r.cls), 7)
const raw = test.map((r) => {
  const p = predictKnn(model, r.f)
  return { truth: r.cls, t: r.s.t, confidence: p.confidence, label: (ABSORB.has(p.label) ? 'idle' : p.label) as Cls }
})

function report(title: string, preds: readonly { truth: Cls; pred: Cls }[]): void {
  const m = new Map<string, number>()
  preds.forEach((p) => m.set(`${p.truth}>${p.pred}`, (m.get(`${p.truth}>${p.pred}`) ?? 0) + 1))
  const cell = (a: Cls, b: Cls): number => m.get(`${a}>${b}`) ?? 0
  console.log(`\n## ${title}\n`)
  console.log(`| истина \\ ответ | ${CLASSES.join(' | ')} | recall |`)
  console.log(`|${'---|'.repeat(CLASSES.length + 2)}`)
  CLASSES.forEach((a) => {
    const total = CLASSES.reduce((s, b) => s + cell(a, b), 0)
    console.log(`| **${a}** | ${CLASSES.map((b) => cell(a, b)).join(' | ')} | ${total ? ((cell(a, a) / total) * 100).toFixed(1) : '—'}% |`)
  })
  const prec = CLASSES.map((b) => {
    const col = CLASSES.reduce((s, a) => s + cell(a, b), 0)
    return col ? `${((cell(b, b) / col) * 100).toFixed(1)}%` : '—'
  })
  console.log(`| precision | ${prec.join(' | ')} | |`)
  const idleTotal = CLASSES.reduce((s, b) => s + cell('idle', b), 0)
  const falseActions = idleTotal - cell('idle', 'idle')
  const acc = preds.filter((p) => p.truth === p.pred).length / preds.length
  console.log(`\naccuracy ${(acc * 100).toFixed(1)}%, ложные действия на idle ${((falseActions / idleTotal) * 100).toFixed(1)}% (${falseActions} из ${idleTotal})`)
}

// kNN покадрово.
report('kNN, покадрово, без порога', raw.map((p) => ({ truth: p.truth, pred: p.label })))

// Порог уверенности: ниже порога — idle.
for (const th of [0.6, 0.75, 0.9]) {
  report(`kNN, порог уверенности ${th}`, raw.map((p) => ({ truth: p.truth, pred: p.confidence >= th ? p.label : 'idle' })))
}

/**
 * Сглаживание настоящим голосователем из src/gestures/voter.ts, а не его копией:
 * иначе оценка меряет одно, а в продукте работает другое.
 * Запись начинается заново, когда меняется класс или в записи разрыв больше 500 мс.
 */
function vote(preds: readonly { truth: Cls; label: Cls; confidence: number; t: number }[], p: VoterParams) {
  const out: { truth: Cls; pred: Cls }[] = []
  let s = initialVoter()
  let prevTruth: Cls | undefined
  let prevT = -Infinity
  for (const row of preds) {
    if (row.truth !== prevTruth || row.t - prevT > 500) s = initialVoter()
    prevTruth = row.truth
    prevT = row.t
    s = stepVoter(s, { label: row.label as Pose, confidence: row.confidence }, p)
    out.push({ truth: row.truth, pred: s.stable as Cls })
  }
  return out
}

const BELOW: Readonly<Record<BelowThreshold, string>> = {
  idle: 'неуверенный кадр голосует за idle',
  skip: 'неуверенный кадр занимает место в окне, но не голосует',
  abstain: 'неуверенный кадр не попадает в окно',
}
for (const [belowThreshold, title] of Object.entries(BELOW) as [BelowThreshold, string][]) {
  report(`4 из 6 кадров: ${title}`, vote(raw, { ...TUNED, belowThreshold }))
}

// Текущие правила motion: кулак при closure > 0.75 и не указательный, указательный — indexOnly.
const rules = test.map((r) => {
  const c = fingerCurls(toLm(r.s.world))
  const pred: Cls = closureOf(c) > 0.75 && !isIndexOnly(c) ? 'fist' : isIndexOnly(c) ? 'point' : closureOf(c) < 0.45 ? 'open' : 'idle'
  return { truth: r.cls, pred }
})
report('текущие правила motion (кулак, ладонь, указательный)', rules)
