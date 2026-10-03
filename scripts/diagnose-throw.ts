/**
 * Разбор записи живого движения: где именно рассыпается бросок.
 *
 * Фикстура из `motion.html` хранит только сырые точки, поэтому `runFixture` гоняет их без
 * классификатора — не так, как работает продукт. Здесь конвейер воспроизведён целиком:
 * признаки → модель → голосователь → поза → closure → машина состояний, и на каждом кадре
 * видно всё, что до этого приходилось угадывать.
 *
 * Запуск: npx tsx scripts/diagnose-throw.ts <файл фикстуры> [--frames]
 */
import { readFileSync } from 'node:fs'
import { GestureClassifier, type GestureModelFile, type Pose } from '../src/gestures/model'
import { DEFAULT_VOTER, initialVoter, MOVING_SPEED, stepVoter, type VoterState } from '../src/gestures/voter'
import { computeFeatures } from '../src/motion/features'
import { parseFixture, decodeFrame } from '../src/motion/fixtures'
import {
  DEFAULT_THRESHOLDS,
  handSpeed,
  initialHandState,
  stepHand,
  stepHandMissing,
  type HandEvent,
  type HandState,
} from '../src/motion/hand-state'
import { oneEuro2DStep, oneEuro2DValue, type OneEuro2DState } from '../src/motion/one-euro'
import { boxToScreen, DEFAULT_POINTER } from '../src/motion/pointer'
import { THROW_SPEED } from '../src/shared/constants'
import { speedOf } from '../src/shared/velocity'

/** Копия POSE_SHAPE из pipeline.ts: там она не экспортирована, а менять модуль ради разбора незачем. */
const POSE_SHAPE: Readonly<Record<Pose, { closure: number; indexOnly: boolean }>> = {
  fist: { closure: 1, indexOnly: false },
  pinch: { closure: 1, indexOnly: false },
  open: { closure: 0, indexOnly: false },
  victory: { closure: 0, indexOnly: false },
  point: { closure: 0, indexOnly: true },
  idle: { closure: 0.6, indexOnly: false },
}

const [file, ...flags] = process.argv.slice(2)
if (!file) throw new Error('usage: tsx scripts/diagnose-throw.ts <fixture.json> [--frames]')
const showFrames = flags.includes('--frames')

/** Перебор параметров голосователя без пересборки: THRESHOLD=0.6 GESTURE_NEED=3 NEED=4 WINDOW=6. */
const envNum = (key: string, fallback: number): number => {
  const v = Number(process.env[key])
  return Number.isFinite(v) && v > 0 ? v : fallback
}
const voterParams = {
  ...DEFAULT_VOTER,
  window: envNum('WINDOW', DEFAULT_VOTER.window),
  need: envNum('NEED', DEFAULT_VOTER.need),
  threshold: envNum('THRESHOLD', DEFAULT_VOTER.threshold),
  gestureNeed: envNum('GESTURE_NEED', DEFAULT_VOTER.gestureNeed),
}

const fx = parseFixture(JSON.parse(readFileSync(file, 'utf8')))
const modelPath = process.env.MODEL ?? 'public/models/gestures-knn.json'
const model = JSON.parse(readFileSync(modelPath, 'utf8')) as GestureModelFile
const classifier = GestureClassifier.fromFile(model)
const th = fx.thresholds ?? DEFAULT_THRESHOLDS

interface Trace {
  readonly t: number
  readonly seen: boolean
  readonly raw: string
  readonly conf: number
  readonly stable: Pose
  readonly closure: number
  readonly speed: number
  readonly peak: number
  readonly phase: string
  readonly events: readonly string[]
}

let hand: HandState = initialHandState()
let voter: VoterState = initialVoter()
let filter: OneEuro2DState | undefined
const trace: Trace[] = []

for (const frame of fx.frames) {
  const { t, hands } = decodeFrame(frame)
  const det = hands[0]
  if (!det) {
    const r = stepHandMissing(hand, t)
    hand = r.state
    if (r.events.length) {
      trace.push({ t, seen: false, raw: '—', conf: 0, stable: voter.stable, closure: NaN, speed: 0, peak: speedOf(hand.peak), phase: hand.phase, events: r.events.map(name) })
    } else {
      trace.push({ t, seen: false, raw: '—', conf: 0, stable: voter.stable, closure: NaN, speed: 0, peak: speedOf(hand.peak), phase: hand.phase, events: [] })
    }
    continue
  }
  const features = computeFeatures(det)
  const raw = classifier.classify(det.world, det.hand === 'right' ? 'Right' : 'Left')
  // Запомненный пик, как в pipeline.ts: «летела только что», а не «летит сейчас».
  voter = stepVoter(voter, raw, voterParams, speedOf(hand.peak) > MOVING_SPEED)
  const shape = POSE_SHAPE[voter.stable]
  filter = oneEuro2DStep(filter, boxToScreen(features.center, DEFAULT_POINTER.box), t)
  const motion = oneEuro2DValue(filter)
  const r = stepHand(hand, { t, x: motion.x, y: motion.y, ...shape }, th)
  hand = r.state
  trace.push({
    t,
    seen: true,
    raw: raw.label,
    conf: raw.confidence,
    stable: voter.stable,
    closure: shape.closure,
    speed: handSpeed(hand),
    peak: speedOf(hand.peak),
    phase: hand.phase,
    events: r.events.map(name),
  })
}

function name(e: HandEvent): string {
  return e.type === 'throw' || e.type === 'release' ? `${e.type}(v=${speedOf(e).toFixed(2)})` : e.type
}

const dts = trace.slice(1).map((r, i) => r.t - trace[i]!.t).filter((d) => d > 0)
const fps = dts.length ? 1000 / (dts.reduce((a, b) => a + b, 0) / dts.length) : 0
const speeds = trace.filter((r) => r.seen).map((r) => r.speed)
const sorted = [...speeds].sort((a, b) => a - b)
const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0

console.log(`# ${fx.name}: ${fx.frames.length} кадров, ${(trace[trace.length - 1]!.t / 1000).toFixed(1)} с, ${fps.toFixed(1)} кадров/с`)
console.log(`пороги: open ${th.open}, hold ${th.hold}, THROW_SPEED ${THROW_SPEED}`)
console.log(`кадров без руки: ${trace.filter((r) => !r.seen).length}`)
console.log(`\n## скорость руки (доли экрана в секунду)`)
console.log(`медиана ${q(0.5).toFixed(2)}  p90 ${q(0.9).toFixed(2)}  p99 ${q(0.99).toFixed(2)}  max ${Math.max(...speeds).toFixed(2)}`)
console.log(`кадров выше THROW_SPEED ${THROW_SPEED}: ${speeds.filter((s) => s > THROW_SPEED).length} из ${speeds.length}`)

const all = trace.flatMap((r) => r.events)
const count = (kind: string): number => all.filter((e) => e.startsWith(kind)).length
console.log(
  `\nИТОГО window=${voterParams.window} need=${voterParams.need} gestureNeed=${voterParams.gestureNeed} ` +
    `threshold=${voterParams.threshold} | grab=${count('grab')} release=${count('release')} throw=${count('throw')} ` +
    `handlost=${count('handlost')}`,
)

console.log(`\n## события`)
const fired = trace.filter((r) => r.events.length)
if (!fired.length) console.log('ни одного события за всю запись')
fired.forEach((r) => console.log(`  ${(r.t / 1000).toFixed(2)} с  ${r.events.join(', ')}  (пик ${r.peak.toFixed(2)}, поза ${r.stable})`))

console.log(`\n## что распознавал классификатор`)
const poses = new Map<string, number>()
trace.filter((r) => r.seen).forEach((r) => poses.set(r.stable, (poses.get(r.stable) ?? 0) + 1))
;[...poses.entries()].sort((a, b) => b[1] - a[1]).forEach(([p, n]) => console.log(`  ${p.padEnd(8)} ${n} кадров`))
const low = trace.filter((r) => r.seen && r.conf < 0.75).length
console.log(`  кадров ниже порога уверенности 0.75: ${low} из ${speeds.length}`)

console.log(`\n## фазы машины состояний`)
const phases = new Map<string, number>()
trace.forEach((r) => phases.set(r.phase, (phases.get(r.phase) ?? 0) + 1))
;[...phases.entries()].sort((a, b) => b[1] - a[1]).forEach(([p, n]) => console.log(`  ${p.padEnd(8)} ${n} кадров`))

// Всплески скорости: то, что человек считал бросками.
console.log(`\n## всплески скорости выше ${(THROW_SPEED * 0.6).toFixed(2)}`)
const BURST = THROW_SPEED * 0.6
let start = -1
let bursts = 0
for (let i = 0; i < trace.length; i++) {
  const fast = trace[i]!.seen && trace[i]!.speed > BURST
  if (fast && start < 0) start = i
  if (!fast && start >= 0) {
    const seg = trace.slice(start, i)
    const top = Math.max(...seg.map((r) => r.speed))
    const after = trace.slice(i, i + Math.round(fps * 0.8))
    const ev = [...seg, ...after].flatMap((r) => r.events)
    const posesIn = [...new Set([...seg, ...after].map((r) => r.stable))].join('→')
    bursts++
    console.log(
      `  ${bursts}. ${(seg[0]!.t / 1000).toFixed(2)} с  пик ${top.toFixed(2)}  позы ${posesIn}  ` +
        `фаза ${[...new Set([...seg, ...after].map((r) => r.phase))].join('→')}  ${ev.length ? ev.join(',') : 'НИЧЕГО'}`,
    )
    start = -1
  }
}
if (!bursts) console.log('  всплесков нет: рука ни разу не разогналась')

if (showFrames) {
  console.log(`\n## покадрово`)
  console.log('  t      raw      conf  stable   clos  speed  peak  phase     events')
  trace.forEach((r) =>
    console.log(
      `  ${(r.t / 1000).toFixed(2).padStart(5)}  ${r.raw.padEnd(8)} ${r.conf.toFixed(2)}  ${r.stable.padEnd(8)} ` +
        `${Number.isNaN(r.closure) ? ' — ' : r.closure.toFixed(1)}  ${r.speed.toFixed(2).padStart(5)}  ${r.peak.toFixed(2).padStart(4)}  ${r.phase.padEnd(8)}  ${r.events.join(',')}`,
    ),
  )
}
