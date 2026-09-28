import type { HandId } from '../contracts/input'

export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface Vec2 {
  readonly x: number
  readonly y: number
}

/** 21 точка руки MediaPipe. */
export type Landmarks = readonly Vec3[]

/** Одна рука в кадре после трекера, до всей логики. */
export interface HandDetection {
  readonly hand: HandId
  /** Нормированные координаты кадра 0..1, не зеркальные. */
  readonly landmarks: Landmarks
  /** Метрические координаты MediaPipe, начало в центре руки. */
  readonly world: Landmarks
  /** Уверенность handedness 0..1. */
  readonly score: number
}

/** Кадр трекера: время в мс и найденные руки. */
export interface TrackerFrame {
  readonly t: number
  readonly hands: readonly HandDetection[]
}

/** Пороги closure для машины состояний. */
export interface Thresholds {
  readonly hold: number
  readonly open: number
}
