import { encodeHand, gestureEventTypes, type Fixture, type FixtureFrame } from './fixtures'
import type { OutEvent } from './pipeline'
import type { RawHand } from './landmarks'
import type { Thresholds } from './types'

/** Запись видео для смоук-тестов и запись кадров landmarks для фикстур. */

export const VIDEO_RECORD_MS = 30_000
const VIDEO_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'] as const

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-')

/** Пишет поток камеры в webm и скачивает файл. Возвращает функцию досрочной остановки. */
export function recordVideo(stream: MediaStream, onDone: () => void, durationMs = VIDEO_RECORD_MS): () => void {
  const mimeType = VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t))
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  rec.onstop = () => {
    download(new Blob(chunks, { type: 'video/webm' }), `gestures-${stamp()}.webm`)
    onDone()
  }
  rec.start()
  const timer = setTimeout(() => rec.state !== 'inactive' && rec.stop(), durationMs)
  return () => {
    clearTimeout(timer)
    if (rec.state !== 'inactive') rec.stop()
  }
}

/** Накопитель кадров фикстуры. Время считается от первого кадра. */
export class FixtureRecorder {
  private frames: FixtureFrame[] = []
  private events: OutEvent[] = []
  private t0: number | undefined

  get size(): number {
    return this.frames.length
  }

  push(t: number, raw: readonly RawHand[], events: readonly OutEvent[]): void {
    this.t0 ??= t
    this.frames = [...this.frames, { t: Math.round(t - this.t0), hands: raw.map(encodeHand) }]
    this.events = [...this.events, ...events]
  }

  /** Скачивает JSON. expected — то, что распознано во время записи, его стоит проверить глазами. */
  save(name: string, thresholds: Thresholds): void {
    const fixture: Fixture = { name, frames: this.frames, expected: gestureEventTypes(this.events), thresholds }
    download(new Blob([JSON.stringify(fixture)], { type: 'application/json' }), `${name}-${stamp()}.json`)
  }
}
