import { fileURLToPath } from 'node:url'

/** Записанное видео жестов для фейковой камеры Chrome. В git не хранится. */
export const GESTURES_VIDEO = fileURLToPath(new URL('../test-assets/gestures.y4m', import.meta.url))
