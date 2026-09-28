import { ONE_EURO_BETA, ONE_EURO_D_CUTOFF, ONE_EURO_MIN_CUTOFF } from './constants'
import type { Vec2 } from './types'

/**
 * One Euro filter (Casiez, Roussel, Vogel 2012): низкая частота среза в покое убирает дрожание,
 * рост частоты с ростом скорости убирает задержку при быстром движении.
 */

export interface OneEuroParams {
  readonly minCutoff: number
  readonly beta: number
  readonly dCutoff: number
}

export const DEFAULT_ONE_EURO: OneEuroParams = {
  minCutoff: ONE_EURO_MIN_CUTOFF,
  beta: ONE_EURO_BETA,
  dCutoff: ONE_EURO_D_CUTOFF,
}

export interface OneEuroState {
  readonly value: number
  readonly deriv: number
  readonly t: number
}

const MS_PER_S = 1000

const alpha = (cutoff: number, dt: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

/** Один шаг фильтра. Время в мс. Возвращает новое состояние, в нём же отфильтрованное значение. */
export function oneEuroStep(
  prev: OneEuroState | undefined,
  value: number,
  t: number,
  params: OneEuroParams = DEFAULT_ONE_EURO,
): OneEuroState {
  if (!prev) return { value, deriv: 0, t }
  const dt = (t - prev.t) / MS_PER_S
  if (dt <= 0) return prev
  const rawDeriv = (value - prev.value) / dt
  const aD = alpha(params.dCutoff, dt)
  const deriv = prev.deriv + aD * (rawDeriv - prev.deriv)
  const cutoff = params.minCutoff + params.beta * Math.abs(deriv)
  const a = alpha(cutoff, dt)
  return { value: prev.value + a * (value - prev.value), deriv, t }
}

export interface OneEuro2DState {
  readonly x: OneEuroState
  readonly y: OneEuroState
}

export function oneEuro2DStep(
  prev: OneEuro2DState | undefined,
  p: Vec2,
  t: number,
  params: OneEuroParams = DEFAULT_ONE_EURO,
): OneEuro2DState {
  return { x: oneEuroStep(prev?.x, p.x, t, params), y: oneEuroStep(prev?.y, p.y, t, params) }
}

export const oneEuro2DValue = (s: OneEuro2DState): Vec2 => ({ x: s.x.value, y: s.y.value })
