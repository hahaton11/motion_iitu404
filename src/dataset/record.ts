import { CameraInput } from '../motion'
import { drawHands, syncCanvas } from '../motion/demo-draw'
import type { RawHand } from '../motion/landmarks'
import { ROUNDS, advance, start, stepsFor, totalMs, type Dataset, type GestureLabel, type Phase, type Sample } from './protocol'
import './record.css'

/** Страница записи датасета: показывает жест, записывает кадры руки, отдаёт JSON для обучения. */

/** Дозапись выбранных жестов: record.html?only=pinch,fist,relaxed. */
const STEPS = stepsFor((new URLSearchParams(location.search).get('only') ?? '').split(',').filter(Boolean))

const round4 = (v: number): number => Math.round(v * 1e4) / 1e4
const pack = (pts: RawHand['landmarks']): number[][] => pts.map((p) => [round4(p.x), round4(p.y), round4(p.z)])

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), { className, textContent: text })
}

const root = document.getElementById('app')
if (!root) throw new Error('record.html needs #app')
const video = Object.assign(el('video'), { muted: true, playsInline: true })
const canvas = el('canvas')
const overlay = el('div', 'rec-overlay', 'Включаю камеру…')
const stage = el('div', 'rec-stage')
stage.append(video, canvas, overlay)
const phaseEl = el('div', 'rec-phase', 'Подготовка')
const titleEl = el('h1', 'rec-title', 'Запись жестов')
const instrEl = el('p', 'rec-instr', `Используй ту руку, которой будешь управлять. Всего около ${Math.max(1, Math.round(totalMs(STEPS) / 60000))} минут, круг из ${STEPS.length} жестов повторится дважды.`)
const bar = el('div', 'rec-bar')
const fill = el('div')
bar.append(fill)
const card = el('div', 'rec-card')
card.append(phaseEl, titleEl, instrEl, bar)
const startBtn = el('button', 'rec-btn', 'Включаю камеру…')
const saveBtn = el('button', 'rec-btn', 'Скачать датасет')
saveBtn.disabled = true
/** Запись идёт около четырёх минут. Терять её из-за сбоя на последней секунде нельзя. */
const saveNote = el('p', 'rec-note', 'Скачать можно в любой момент — записанное до этой секунды не пропадёт')
const counts = el('div', 'rec-counts')
const side = el('div', 'rec-side')
const controls = el('div', 'rec-card')
controls.append(startBtn, el('div', '', ' '), saveBtn, saveNote)
const countsCard = el('div', 'rec-card')
countsCard.append(counts)
side.append(card, controls, countsCard)
const layout = el('div', 'rec')
layout.append(stage, side)
root.append(layout)

const input = new CameraInput({ video })
const samples: Sample[] = []
let phase: Phase = { kind: 'idle' }
let saved = false

let countedAt = -1

function renderCounts(): void {
  if (samples.length === countedAt) return
  countedAt = samples.length
  const by = new Map<string, number>()
  samples.forEach((s) => by.set(`${s.label} r${s.round + 1}`, (by.get(`${s.label} r${s.round + 1}`) ?? 0) + 1))
  counts.textContent = [...by.entries()].map(([k, v]) => `${k.padEnd(14)} ${v}`).join('\n') || 'кадров пока нет'
  // Кнопка открывается сразу, как появились кадры: неполная запись лучше потерянной.
  saveBtn.disabled = samples.length === 0
  const partial = samples.length > 0 && phase.kind !== 'done'
  saveBtn.textContent = partial ? `Скачать что записано (${samples.length} кадров)` : 'Скачать датасет'
}

function renderPhase(t: number): void {
  if (phase.kind === 'idle') return
  if (phase.kind === 'done') {
    phaseEl.textContent = 'Готово'
    titleEl.textContent = 'Запись закончена'
    instrEl.textContent = 'Нажми «Скачать датасет» и напиши в чат, что файл скачан'
    overlay.textContent = 'Готово'
    fill.style.width = '100%'
    renderCounts()
    return
  }
  const step = STEPS[phase.step]
  if (!step) return
  const recording = phase.kind === 'record'
  const dur = recording ? step.recordMs : 3000
  const left = Math.max(0, Math.ceil((dur - (t - phase.since)) / 1000))
  // Круг и номер жеста видны всё время: иначе на переходе к кругу 2 кажется, что запись началась заново.
  const where = `Круг ${phase.round + 1} из ${ROUNDS} · жест ${phase.step + 1} из ${STEPS.length}`
  phaseEl.textContent = `${where} · ${recording ? 'запись' : 'приготовься'} · ${left} с`
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
  phase = advance(phase, now, STEPS)
  if (phase.kind === 'record') {
    const step = STEPS[phase.step]
    if (step) capture(info.t, info.raw, step.label, phase.round)
  }
  renderPhase(now)
  if (samples.length - countedAt >= 30) renderCounts()
})

let cameraReady = false

/** Камера включается сразу при открытии, чтобы было видно, что рука в кадре. Ошибка — крупно на экране. */
function startCamera(): void {
  overlay.textContent = 'Включаю камеру…'
  startBtn.disabled = true
  input
    .start()
    .then(() => {
      cameraReady = true
      overlay.textContent = 'Камера работает. Нажми «Начать»'
      startBtn.textContent = 'Начать'
      startBtn.disabled = false
    })
    .catch((err: unknown) => {
      const text = err instanceof Error ? err.message : 'Камера недоступна'
      overlay.textContent = text
      titleEl.textContent = 'Камера не включилась'
      instrEl.textContent = `${text}. Закрой другие вкладки с localhost:5173 и приложения с камерой, затем нажми «Включить камеру»`
      startBtn.textContent = 'Включить камеру'
      startBtn.disabled = false
    })
}

startBtn.addEventListener('click', () => {
  if (!cameraReady) return startCamera()
  startBtn.disabled = true
  phase = start(performance.now())
})

saveBtn.addEventListener('click', () => {
  const data: Dataset = { version: 1, recordedAt: new Date().toISOString(), userAgent: navigator.userAgent, samples }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `gestures-${Date.now()}.json` })
  a.click()
  saved = true
  saveNote.textContent = `Скачано ${samples.length} кадров. Файл в Загрузках, имя начинается с gestures-`
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

/**
 * Записанное живёт только в памяти вкладки: перезагрузка стирает четыре минуты работы молча.
 * Пока запись не скачана, уход со страницы требует подтверждения.
 */
window.addEventListener('beforeunload', (e) => {
  if (samples.length === 0 || saved) return
  e.preventDefault()
})

renderCounts()
startCamera()
