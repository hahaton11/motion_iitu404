import { VELOCITY_WINDOW_MS } from './constants'

interface Sample {
  readonly x: number
  readonly y: number
  readonly t: number
}

/** Скорость по последним точкам в скользящем окне. Возвращает новый трекер на каждый push. */
export class VelocityTracker {
  private constructor(private readonly samples: readonly Sample[]) {}

  static empty(): VelocityTracker {
    return new VelocityTracker([])
  }

  push(x: number, y: number, t: number): VelocityTracker {
    const fresh = this.samples.filter((s) => t - s.t <= VELOCITY_WINDOW_MS)
    return new VelocityTracker([...fresh, { x, y, t }])
  }

  velocity(): { vx: number; vy: number } {
    const first = this.samples[0]
    const last = this.samples[this.samples.length - 1]
    if (!first || !last || last.t === first.t) return { vx: 0, vy: 0 }
    const dt = (last.t - first.t) / 1000
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt }
  }
}

export const speedOf = (v: { vx: number; vy: number }): number => Math.hypot(v.vx, v.vy)
