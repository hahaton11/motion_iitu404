/** Скользящие FPS и задержка обработки кадра для демо и отладки. */

export interface FrameStats {
  readonly fps: number
  readonly latencyMs: number
  readonly lastT: number | undefined
}

/** Вес нового кадра в экспоненциальном среднем. */
export const STATS_SMOOTHING = 0.1
const MS_PER_S = 1000

export const initialStats = (): FrameStats => ({ fps: 0, latencyMs: 0, lastT: undefined })

const ema = (prev: number, next: number): number => (prev === 0 ? next : prev + STATS_SMOOTHING * (next - prev))

export function stepStats(s: FrameStats, t: number, latencyMs: number): FrameStats {
  const dt = s.lastT === undefined ? 0 : t - s.lastT
  const fps = dt > 0 ? ema(s.fps, MS_PER_S / dt) : s.fps
  return { fps, latencyMs: ema(s.latencyMs, latencyMs), lastT: t }
}
