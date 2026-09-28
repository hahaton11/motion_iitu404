import {
  CALIBRATION_HOLD_RATIO,
  CALIBRATION_MIN_RANGE,
  CALIBRATION_MIN_SAMPLES,
  CALIBRATION_OPEN_RATIO,
  CALIBRATION_SETTLE_MS,
  CALIBRATION_STEP_MS,
} from './constants'
import type { Thresholds } from './types'

/**
 * Калибровка за два шага по 2,5 секунды: открытая ладонь, затем кулак.
 * По медианам closure в каждом шаге пересчитываются пороги holding и open.
 */

export type CalibrationStep = 'open' | 'fist' | 'done' | 'failed'

export interface CalibrationResult {
  readonly openValue: number
  readonly fistValue: number
  readonly thresholds: Thresholds
}

export interface CalibrationState {
  readonly step: CalibrationStep
  readonly stepStart: number
  readonly openSamples: readonly number[]
  readonly fistSamples: readonly number[]
  readonly result: CalibrationResult | undefined
  /** Что сделать, если калибровка не удалась. */
  readonly error: string | undefined
}

export const CALIBRATION_PROMPTS: Readonly<Record<CalibrationStep, string>> = {
  open: 'Разведи большой и указательный пальцы',
  fist: 'Сомкни их в щипок',
  done: 'Готово, пороги настроены под твою руку',
  failed: 'Повтори калибровку',
}

export const CALIBRATION_ERRORS = {
  noHand: 'Держи руку в кадре все 5 секунд и повтори калибровку',
  smallRange: 'Разведи пальцы шире и сомкни щипок плотнее, затем повтори калибровку',
} as const

export function startCalibration(t: number): CalibrationState {
  return { step: 'open', stepStart: t, openSamples: [], fistSamples: [], result: undefined, error: undefined }
}

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2
}

/** Пороги между измеренными значениями ладони и кулака. undefined, если диапазон слишком мал. */
export function thresholdsBetween(openValue: number, fistValue: number): Thresholds | undefined {
  const range = fistValue - openValue
  if (range < CALIBRATION_MIN_RANGE) return undefined
  return { hold: openValue + range * CALIBRATION_HOLD_RATIO, open: openValue + range * CALIBRATION_OPEN_RATIO }
}

function finish(s: CalibrationState, t: number): CalibrationState {
  const fail = (error: string): CalibrationState => ({ ...s, step: 'failed', stepStart: t, error })
  if (s.openSamples.length < CALIBRATION_MIN_SAMPLES || s.fistSamples.length < CALIBRATION_MIN_SAMPLES) {
    return fail(CALIBRATION_ERRORS.noHand)
  }
  const openValue = median(s.openSamples)
  const fistValue = median(s.fistSamples)
  const thresholds = thresholdsBetween(openValue, fistValue)
  if (!thresholds) return fail(CALIBRATION_ERRORS.smallRange)
  return { ...s, step: 'done', stepStart: t, result: { openValue, fistValue, thresholds } }
}

/** Шаг по кадру. closure undefined, если руки в кадре нет. */
export function stepCalibration(s: CalibrationState, t: number, closure: number | undefined): CalibrationState {
  if (s.step === 'done' || s.step === 'failed') return s
  const elapsed = t - s.stepStart
  if (elapsed >= CALIBRATION_STEP_MS) {
    return s.step === 'open' ? { ...s, step: 'fist', stepStart: t } : finish(s, t)
  }
  if (closure === undefined || elapsed < CALIBRATION_SETTLE_MS) return s
  return s.step === 'open'
    ? { ...s, openSamples: [...s.openSamples, closure] }
    : { ...s, fistSamples: [...s.fistSamples, closure] }
}

/** Прогресс текущего шага 0..1. */
export function calibrationProgress(s: CalibrationState, t: number): number {
  if (s.step === 'done' || s.step === 'failed') return 1
  return Math.min(1, Math.max(0, (t - s.stepStart) / CALIBRATION_STEP_MS))
}
