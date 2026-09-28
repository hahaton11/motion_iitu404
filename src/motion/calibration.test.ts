import { describe, expect, it } from 'vitest'
import {
  CALIBRATION_ERRORS,
  calibrationProgress,
  median,
  startCalibration,
  stepCalibration,
  thresholdsBetween,
  type CalibrationState,
} from './calibration'

const FRAME_MS = 1000 / 30

/** Прогоняет калибровку: closureAt(t) возвращает значение в момент t от начала. */
const runCalibration = (closureAt: (t: number) => number | undefined, totalMs = 5200): CalibrationState => {
  let s = startCalibration(0)
  for (let t = 0; t <= totalMs; t += FRAME_MS) s = stepCalibration(s, t, closureAt(t))
  return s
}

describe('median', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
  })
})

describe('thresholdsBetween', () => {
  it('reproduces the defaults for the full range', () => {
    const th = thresholdsBetween(0, 1)!
    expect(th.hold).toBeCloseTo(0.75)
    expect(th.open).toBeCloseTo(0.45)
  })

  it('rejects a too narrow range', () => {
    expect(thresholdsBetween(0.3, 0.45)).toBeUndefined()
  })
})

describe('stepCalibration', () => {
  it('goes open → fist → done and places thresholds between measured values', () => {
    const s = runCalibration((t) => (t < 2500 ? 0.15 : 0.85))
    expect(s.step).toBe('done')
    expect(s.result?.openValue).toBeCloseTo(0.15)
    expect(s.result?.fistValue).toBeCloseTo(0.85)
    expect(s.result?.thresholds.hold).toBeCloseTo(0.15 + 0.7 * 0.75)
    expect(s.result?.thresholds.open).toBeCloseTo(0.15 + 0.7 * 0.45)
  })

  it('skips the settle time at the start of each step', () => {
    const s = runCalibration((t) => {
      if (t < 2500) return t < 500 ? 0.9 : 0.1
      return t < 3000 ? 0.1 : 0.9
    })
    expect(s.result?.openValue).toBeCloseTo(0.1)
    expect(s.result?.fistValue).toBeCloseTo(0.9)
  })

  it('is robust to a few outlier frames', () => {
    const s = runCalibration((t) => (t < 2500 ? (Math.round(t) % 7 === 0 ? 0.9 : 0.1) : 0.9))
    expect(s.result?.openValue).toBeCloseTo(0.1)
  })

  it('fails with an action when the hand is missing', () => {
    const s = runCalibration(() => undefined)
    expect(s.step).toBe('failed')
    expect(s.error).toBe(CALIBRATION_ERRORS.noHand)
  })

  it('fails with an action when the fist is not closed enough', () => {
    const s = runCalibration((t) => (t < 2500 ? 0.3 : 0.4))
    expect(s.error).toBe(CALIBRATION_ERRORS.smallRange)
  })

  it('stays finished after done', () => {
    const s = runCalibration((t) => (t < 2500 ? 0.1 : 0.9))
    expect(stepCalibration(s, 99999, 0.5)).toBe(s)
  })
})

describe('calibrationProgress', () => {
  it('reports progress inside a step', () => {
    const s = startCalibration(1000)
    expect(calibrationProgress(s, 1000)).toBe(0)
    expect(calibrationProgress(s, 2250)).toBeCloseTo(0.5)
    expect(calibrationProgress(s, 9999)).toBe(1)
  })
})
