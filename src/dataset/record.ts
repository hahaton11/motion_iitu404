import { CameraInput } from '../motion'
import { drawHands, syncCanvas } from '../motion/demo-draw'
import type { RawHand } from '../motion/landmarks'
import { STEPS, advance, start, totalMs, type Dataset, type GestureLabel, type Phase, type Sample } from './protocol'
import './record.css'

/** Страница записи датасета: показывает жест, записывает кадры руки, отдаёт JSON для обучения. */

const round4 = (v: number): number => Math.round(v * 1e4) / 1e4
const pack = (pts: RawHand['landmarks']): number[][] => pts.map((p) => [round4(p.x), round4(p.y), round4(p.z)])

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), { className, textContent: text })
}

const root = document.getElementById('app')
if (!root) throw new Error('record.html needs #app')
const video = Object.assign(el('video'), { muted: true, playsInline: true })
const canvas = el('canvas')
const overlay = el('div', 'rec-overlay', 'Нажми «Начать»')
const stage = el('div', 'rec-stage')
stage.append(video, canvas, overlay)
const phaseEl = el('div', 'rec-phase', 'Подготовка')
const titleEl = el('h1', 'rec-title', 'Запись жестов')
const instrEl = el('p', 'rec-instr', `Используй ту руку, которой будешь управлять. Всего около ${Math.round(totalMs() / 60000)} минут, круг из ${STEPS.length} жестов повторится дважды.`)
const bar = el('div', 'rec-bar')
const fill = el('div')
bar.append(fill)
const card = el('div', 'rec-card')
card.append(phaseEl, titleEl, instrEl, bar)
const startBtn = el('button', 'rec-btn', 'Начать')
const saveBtn = el('button', 'rec-btn', 'Скачать датасет')
saveBtn.disabled = true
const counts = el('div', 'rec-counts')
const side = el('div', 'rec-side')
const controls = el('div', 'rec-card')
controls.append(startBtn, el('div', '', ' '), saveBtn)
const countsCard = el('div', 'rec-card')
countsCard.append(counts)
side.append(card, controls, countsCard)
const layout = el('div', 'rec')
layout.append(stage, side)
root.append(layout)

const input = new CameraInput({ video })
const samples: Sample[] = []
let phase: Phase = { kind: 'idle' }

function renderCounts(): void {
  const by = new Map<string, number>()
  samples.forEach((s) => by.set(`${s.label} r${s.round + 1}`, (by.get(`${s.label} r${s.round + 1}`) ?? 0) + 1))
  counts.textContent = [...by.entries()].map(([k, v]) => `${k.padEnd(14)} ${v}`).join('\n') || 'кадров пока нет'
}

function renderPhase(t: number): void {
  if (phase.kind === 'idle') return
  if (phase.kind === 'done') {
    phaseEl.textContent = 'Готово'
    titleEl.textContent = 'Запись закончена'
    instrEl.textContent = 'Нажми «Скачать датасет» и напиши в чат, что файл скачан'
    overlay.textContent = 'Готово'
    fill.style.width = '100%'
    saveBtn.disabled = false
    return
  }
  const step = STEPS[phase.step]
  if (!step) return
  const recording = phase.kind === 'record'
  const dur = recording ? step.recordMs : 3000
  const left = Math.max(0, Math.ceil((dur - (t - phase.since)) / 1000))
  phaseEl.textContent = `Круг ${phase.round + 1} · ${recording ? 'запись' : 'приготовься'} · ${left} с`
  phaseEl.classList.toggle('is-record', recording)
  titleEl.textContent = step.title
  instrEl.textContent = step.instruction
  overlay.textContent = recording ? `● ${step.title}` : `Приготовься: ${step.title}`
  fill.style.width = `${Math.min(100, ((t - phase.since) / dur) * 100)}%`
}

function capture(t: number, raw: readonly RawHand[], label: GestureLabel, round: number): void {
  const hand = raw[0]
  if (!hand) return
  samples.push({ label, round, t: Math.round(t), handLabel: hand.label, score: round4(hand.score), lm: pack(hand.landmarks), world: pack(hand.world) })
}

input.onFrame((info) => {
  const ctx = syncCanvas(canvas, video)
  if (ctx) drawHands(ctx, info.hands)
  const now = performance.now()
  phase = advance(phase, now)
  if (phase.kind === 'record') {
    const step = STEPS[phase.step]
    if (step) capture(info.t, info.raw, step.label, phase.round)
  }
  renderPhase(now)
  if (samples.length % 30 === 0) renderCounts()
})

startBtn.addEventListener('click', () => {
  startBtn.disabled = true
  input
    .start()
    .then(() => {
      phase = start(performance.now())
    })
    .catch((err: unknown) => {
      overlay.textContent = err instanceof Error ? err.message : 'Камера недоступна'
      startBtn.disabled = false
    })
})

saveBtn.addEventListener('click', () => {
  const data: Dataset = { version: 1, recordedAt: new Date().toISOString(), userAgent: navigator.userAgent, samples }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `gestures-${Date.now()}.json` })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

renderCounts()
