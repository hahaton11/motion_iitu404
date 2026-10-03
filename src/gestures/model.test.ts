import { afterEach, describe, expect, it, vi } from 'vitest'
import { GestureClassifier, type GestureModelFile } from './model'

/**
 * Модель приходит байтами, а не разобранным JSON: их считает индикатор загрузки.
 * Ошибка в разборе не упала бы, а тихо вернула правила по углам пальцев — 67,6 % точности
 * вместо 99,2 %. Поэтому путь загрузки проверяется отдельно от классификации.
 */

const FILE: GestureModelFile = {
  version: 1,
  k: 1,
  absorb: ['pinch'],
  labels: ['fist', 'open', 'pinch'],
  features: [
    [0, 0, 0],
    [1, 1, 1],
    [0.5, 0.5, 0.5],
  ],
}

afterEach(() => vi.restoreAllMocks())

describe('GestureClassifier.load', () => {
  it('reads the model out of raw bytes', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(FILE))
    const classifier = await GestureClassifier.load('models/gestures-knn.json', () => Promise.resolve(bytes))
    expect(classifier).toBeInstanceOf(GestureClassifier)
  })

  it('reports a broken response instead of returning a silent fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }))
    await expect(GestureClassifier.load('models/gestures-knn.json')).rejects.toThrow('404')
  })

  it('refuses a truncated file rather than classifying on half a model', async () => {
    const half = new TextEncoder().encode(JSON.stringify(FILE).slice(0, 20))
    await expect(GestureClassifier.load('u', () => Promise.resolve(half))).rejects.toThrow()
  })
})
