import type { BoardState } from '../board'
import type { CameraInput, LoadProgress } from '../motion'
import type { Evaluation } from './challenge'
import type { ExportZone } from './export'
import type { FlowEvent, FlowState } from './flow'
import type { GestureButtons } from './gesture-button'
import type { HintToaster } from './hint-view'
import type { InputHub } from './input-hub'
import type { KeyValueStore } from './records'
import type { Sound } from './sound'

/** Общий контекст экранов: всё, что приложение даёт экрану, и способ сообщить о переходе. */

export type CameraPhase = 'off' | 'loading' | 'ready' | 'failed'

export interface CameraStatus {
  readonly phase: CameraPhase
  /** Что сделать, если камера не включилась. */
  readonly message?: string
  /** Сколько моделей и wasm уже скачано. Есть только в фазе загрузки. */
  readonly progress?: LoadProgress
}

export interface ChallengeResult {
  readonly evaluation: Evaluation
  readonly elapsedMs: number
  readonly hintCounts: Readonly<Record<string, number>>
  readonly hintMessages: Readonly<Record<string, string>>
  readonly score: number
  readonly state: BoardState
  readonly zones: readonly ExportZone[]
  readonly finishedAt: number
}

export interface AppContext {
  /** Слой экранов поверх доски. */
  readonly layer: HTMLElement
  /** Сюда монтируется доска досочных экранов. */
  readonly boardHost: HTMLElement
  readonly hub: InputHub
  readonly buttons: GestureButtons
  readonly sound: Sound
  readonly hints: HintToaster
  readonly store: KeyValueStore
  flow(): FlowState
  send(e: FlowEvent): void
  camera(): CameraInput | undefined
  cameraStatus(): CameraStatus
  onCameraStatus(fn: (s: CameraStatus) => void): () => void
  startCamera(): void
  /** Переключить источник на мышь, не меняя экран. */
  switchToMouse(): void
  lastResult(): ChallengeResult | undefined
  setLastResult(r: ChallengeResult): void
}

export interface ScreenHandle {
  destroy(): void
}

export type ScreenMount = (ctx: AppContext) => ScreenHandle
