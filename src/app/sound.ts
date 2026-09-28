/**
 * Короткие звуки, синтезированные WebAudio: никаких аудиофайлов и чужих лицензий.
 * AudioContext создаётся при первом звуке; браузер может держать его на паузе до первого клика.
 * Выключение звука запоминается в localStorage.
 */

export type SoundName = 'grab' | 'drop' | 'throw' | 'pocket' | 'step' | 'final' | 'tick'

interface Tone {
  readonly freq: number
  /** Частота в конце, для глиссандо. */
  readonly to?: number
  readonly start: number
  readonly dur: number
  readonly type: OscillatorType
  readonly gain: number
}

const MUTE_KEY = 'motion-board-muted'
const MASTER_GAIN = 0.5

const TONES: Readonly<Record<Exclude<SoundName, 'throw'>, readonly Tone[]>> = {
  grab: [{ freq: 520, to: 780, start: 0, dur: 0.08, type: 'sine', gain: 0.25 }],
  drop: [{ freq: 240, to: 120, start: 0, dur: 0.12, type: 'triangle', gain: 0.35 }],
  pocket: [
    { freq: 660, start: 0, dur: 0.09, type: 'sine', gain: 0.22 },
    { freq: 990, start: 0.08, dur: 0.12, type: 'sine', gain: 0.22 },
  ],
  step: [
    { freq: 523, start: 0, dur: 0.1, type: 'triangle', gain: 0.25 },
    { freq: 659, start: 0.09, dur: 0.1, type: 'triangle', gain: 0.25 },
    { freq: 784, start: 0.18, dur: 0.18, type: 'triangle', gain: 0.25 },
  ],
  final: [
    { freq: 392, start: 0, dur: 0.14, type: 'triangle', gain: 0.25 },
    { freq: 523, start: 0.13, dur: 0.14, type: 'triangle', gain: 0.25 },
    { freq: 659, start: 0.26, dur: 0.14, type: 'triangle', gain: 0.25 },
    { freq: 1046, start: 0.39, dur: 0.4, type: 'sine', gain: 0.3 },
  ],
  tick: [{ freq: 1200, start: 0, dur: 0.03, type: 'square', gain: 0.06 }],
}

const THROW_DUR = 0.28

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export class Sound {
  private ctx: AudioContext | undefined
  private master: GainNode | undefined
  private muted = readMuted()
  private readonly listeners = new Set<(muted: boolean) => void>()

  isMuted(): boolean {
    return this.muted
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      // Без хранилища выбор живёт до перезагрузки.
    }
    this.listeners.forEach((fn) => fn(muted))
  }

  onChange(fn: (muted: boolean) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Вызывать из обработчика клика, чтобы браузер разрешил звук. */
  unlock(): void {
    void this.context()?.resume().catch(() => undefined)
  }

  play(name: SoundName): void {
    if (this.muted) return
    const ctx = this.context()
    if (!ctx || !this.master) return
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    if (name === 'throw') this.noise(ctx, this.master)
    else TONES[name].forEach((t) => this.tone(ctx, this.master as GainNode, t))
  }

  private context(): AudioContext | undefined {
    if (this.ctx) return this.ctx
    const Ctor = window.AudioContext as typeof AudioContext | undefined
    if (!Ctor) return undefined
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = MASTER_GAIN
    this.master.connect(this.ctx.destination)
    return this.ctx
  }

  private tone(ctx: AudioContext, out: AudioNode, t: Tone): void {
    const at = ctx.currentTime + t.start
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = t.type
    osc.frequency.setValueAtTime(t.freq, at)
    if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, at + t.dur)
    env.gain.setValueAtTime(0.0001, at)
    env.gain.exponentialRampToValueAtTime(t.gain, at + 0.01)
    env.gain.exponentialRampToValueAtTime(0.0001, at + t.dur)
    osc.connect(env).connect(out)
    osc.start(at)
    osc.stop(at + t.dur + 0.02)
  }

  /** Бросок: шум через полосовой фильтр, который уезжает вверх. */
  private noise(ctx: AudioContext, out: AudioNode): void {
    const at = ctx.currentTime
    const len = Math.floor(ctx.sampleRate * THROW_DUR)
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.2
    filter.frequency.setValueAtTime(400, at)
    filter.frequency.exponentialRampToValueAtTime(3200, at + THROW_DUR)
    const env = ctx.createGain()
    env.gain.value = 0.5
    src.connect(filter).connect(env).connect(out)
    src.start(at)
  }
}
