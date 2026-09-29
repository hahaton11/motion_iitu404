import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ASSET_BYTES,
  LoadMeter,
  fetchCounting,
  finishAsset,
  formatMb,
  initialAssets,
  reportAsset,
  summarize,
} from './loading'

const TOTAL = ASSET_BYTES.wasm + ASSET_BYTES.model + ASSET_BYTES.gestures

/** Ответ с телом-потоком: куски приходят по одному, как от сети. */
function streamed(chunks: readonly Uint8Array[], contentLength: number | undefined): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(c))
      controller.close()
    },
  })
  const headers = new Headers(contentLength === undefined ? {} : { 'content-length': String(contentLength) })
  return new Response(body, { status: 200, headers })
}

const stubFetch = (res: Response | (() => Response)) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(typeof res === 'function' ? res() : res))

afterEach(() => vi.restoreAllMocks())

describe('summarize', () => {
  it('weighs assets by size, not by count', () => {
    const half = reportAsset(initialAssets(), 'wasm', ASSET_BYTES.wasm / 2)
    expect(summarize(half).ratio).toBeCloseTo(ASSET_BYTES.wasm / 2 / TOTAL)
    expect(summarize(half).totalBytes).toBe(TOTAL)
    expect(summarize(half).done).toBe(false)
  })

  it('reaches one when every asset is finished', () => {
    let map = initialAssets()
    map = finishAsset(finishAsset(finishAsset(map, 'wasm'), 'model'), 'gestures')
    expect(summarize(map)).toMatchObject({ ratio: 1, done: true })
  })

  it('replaces the estimated size with Content-Length', () => {
    const map = reportAsset(initialAssets(), 'gestures', 100, 200)
    expect(map.gestures.total).toBe(200)
    expect(summarize(map).totalBytes).toBe(ASSET_BYTES.wasm + ASSET_BYTES.model + 200)
  })

  it('never lets a finished asset move the bar back', () => {
    const map = reportAsset(finishAsset(initialAssets(), 'model'), 'model', 0)
    expect(map.model.done).toBe(true)
    expect(map.model.loaded).toBe(ASSET_BYTES.model)
  })

  it('trusts the bytes over a short Content-Length', () => {
    const map = reportAsset(initialAssets(), 'gestures', 300, 200)
    expect(map.gestures.total).toBe(300)
    expect(summarize(map).loadedBytes).toBe(300)
  })
})

describe('formatMb', () => {
  it('writes megabytes with a comma', () => {
    expect(formatMb(8_449_000)).toBe('8,4')
    expect(formatMb(0)).toBe('0,0')
  })
})

describe('fetchCounting', () => {
  it('reports growing byte counts and returns the whole body', async () => {
    stubFetch(() => streamed([new Uint8Array([1, 2]), new Uint8Array([3])], 3))
    const seen: number[] = []
    const bytes = await fetchCounting('u', (loaded) => seen.push(loaded))
    expect(seen).toEqual([2, 3])
    expect(Array.from(bytes)).toEqual([1, 2, 3])
  })

  it('counts without keeping the body when the bytes are not needed', async () => {
    stubFetch(() => streamed([new Uint8Array(64), new Uint8Array(64)], 128))
    const seen: (number | undefined)[] = []
    const bytes = await fetchCounting('u', (_loaded, total) => seen.push(total), false)
    expect(bytes.length).toBe(0)
    expect(seen).toEqual([128, 128])
  })

  it('throws on a failed response', async () => {
    stubFetch(new Response('', { status: 404 }))
    await expect(fetchCounting('models/x', () => undefined)).rejects.toThrow('404')
  })
})

describe('LoadMeter', () => {
  it('drives one ratio across parallel downloads', async () => {
    stubFetch(() => streamed([new Uint8Array(ASSET_BYTES.gestures)], ASSET_BYTES.gestures))
    const seen: number[] = []
    const meter = new LoadMeter((p) => seen.push(p.ratio))
    await meter.fetch('gestures', 'models/gestures-knn.json')
    expect(meter.progress.ratio).toBeCloseTo(ASSET_BYTES.gestures / TOTAL)
    expect(seen.at(-1)).toBeCloseTo(meter.progress.ratio)
    expect(meter.progress.done).toBe(false)
  })

  it('closes the asset even when it fails, so the bar cannot stall', async () => {
    stubFetch(new Response('', { status: 500 }))
    const meter = new LoadMeter()
    await expect(meter.warm('wasm', 'mediapipe/wasm/x.wasm')).rejects.toThrow('500')
    expect(meter.progress.ratio).toBeCloseTo(ASSET_BYTES.wasm / TOTAL)
  })

  it('is done only after every asset is closed', async () => {
    stubFetch(() => streamed([new Uint8Array(8)], 8))
    const meter = new LoadMeter()
    await Promise.all([meter.warm('wasm', 'a'), meter.fetch('model', 'b'), meter.fetch('gestures', 'c')])
    expect(meter.progress.done).toBe(true)
    expect(meter.progress.ratio).toBe(1)
  })
})
