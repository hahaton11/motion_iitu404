/**
 * Счётчик загрузки распознавания. До первого кадра качается около 22 МБ: wasm MediaPipe,
 * модель кисти и модель жестов. Без индикатора страница выглядит зависшей, поэтому байты
 * считаются своим кодом. Модель кисти и модель жестов отдаются дальше буфером, wasm только
 * прогревает кэш браузера — его грузит сам MediaPipe и берёт из кэша.
 */

export type AssetKey = 'wasm' | 'model' | 'gestures'

export const ASSET_KEYS: readonly AssetKey[] = ['wasm', 'model', 'gestures']

/** Размеры файлов в public/: по ним считается доля, пока сервер не прислал Content-Length. */
export const ASSET_BYTES: Readonly<Record<AssetKey, number>> = {
  wasm: 11_756_954,
  model: 7_819_105,
  gestures: 2_096_056,
}

/** Насколько должна вырасти доля, чтобы сообщить наверх: иначе перерисовка на каждый кусок потока. */
export const PROGRESS_STEP = 0.005

export interface AssetState {
  readonly loaded: number
  /** Content-Length, если пришёл, иначе оценка из ASSET_BYTES. */
  readonly total: number
  readonly done: boolean
}

export type AssetMap = Readonly<Record<AssetKey, AssetState>>

export interface LoadProgress {
  /** Доля 0..1 по всем файлам, взвешенная по размеру. */
  readonly ratio: number
  readonly loadedBytes: number
  readonly totalBytes: number
  /** Всё скачано. Дальше MediaPipe разворачивает wasm, и это время уже не измерить. */
  readonly done: boolean
}

const patch = (map: AssetMap, key: AssetKey, state: AssetState): AssetMap => ({ ...map, [key]: state })

export function initialAssets(): AssetMap {
  const empty = (key: AssetKey): AssetState => ({ loaded: 0, total: ASSET_BYTES[key], done: false })
  return { wasm: empty('wasm'), model: empty('model'), gestures: empty('gestures') }
}

/** Новое показание по файлу. Законченный файл больше не меняется: доля не должна уезжать назад. */
export function reportAsset(map: AssetMap, key: AssetKey, loaded: number, total?: number): AssetMap {
  const prev = map[key]
  if (prev.done) return map
  const size = total !== undefined && total > 0 ? total : prev.total
  return patch(map, key, { loaded, total: Math.max(size, loaded), done: false })
}

/** Файл дошёл до конца — или отказал. В обоих случаях его место в счётчике закрыто. */
export function finishAsset(map: AssetMap, key: AssetKey): AssetMap {
  const total = Math.max(map[key].total, map[key].loaded)
  return patch(map, key, { loaded: total, total, done: true })
}

export function summarize(map: AssetMap): LoadProgress {
  const states = ASSET_KEYS.map((k) => map[k])
  const totalBytes = states.reduce((sum, a) => sum + a.total, 0)
  const loadedBytes = states.reduce((sum, a) => sum + Math.min(a.loaded, a.total), 0)
  return {
    ratio: totalBytes > 0 ? loadedBytes / totalBytes : 1,
    loadedBytes,
    totalBytes,
    done: states.every((a) => a.done),
  }
}

/** Мегабайты для подписи: 8_400_000 → «8,4». */
export const formatMb = (bytes: number): string => (bytes / 1_000_000).toFixed(1).replace('.', ',')

type OnBytes = (loaded: number, total: number | undefined) => void

const EMPTY = new Uint8Array(0)

function join(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size)
  let at = 0
  chunks.forEach((chunk) => {
    out.set(chunk, at)
    at += chunk.length
  })
  return out
}

async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onBytes: OnBytes,
  total: number | undefined,
  keep: boolean,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    loaded += chunk.value.length
    if (keep) chunks.push(chunk.value)
    onBytes(loaded, total)
  }
  return keep ? join(chunks, loaded) : EMPTY
}

/** Загрузка с подсчётом байтов. При `keep = false` куски выбрасываются: нужен только кэш и счёт. */
export async function fetchCounting(url: string, onBytes: OnBytes, keep = true): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  const header = res.headers.get('content-length')
  const total = header ? Number(header) : undefined
  if (!res.body) {
    const whole = new Uint8Array(await res.arrayBuffer())
    onBytes(whole.length, whole.length)
    return keep ? whole : EMPTY
  }
  return readStream(res.body.getReader(), onBytes, total, keep)
}

/** Общий счётчик на одну загрузку приложения: файлы качаются параллельно, доля одна. */
export class LoadMeter {
  private assets = initialAssets()
  private reported = -1

  constructor(private readonly onChange?: (p: LoadProgress) => void) {}

  get progress(): LoadProgress {
    return summarize(this.assets)
  }

  /** Скачать файл и отдать байты. */
  fetch(key: AssetKey, url: string): Promise<Uint8Array> {
    return this.run(key, url, true)
  }

  /** Скачать ради кэша браузера и счётчика: сами байты возьмёт MediaPipe. */
  async warm(key: AssetKey, url: string): Promise<void> {
    await this.run(key, url, false)
  }

  private async run(key: AssetKey, url: string, keep: boolean): Promise<Uint8Array> {
    try {
      return await fetchCounting(url, (loaded, total) => this.step(key, loaded, total), keep)
    } finally {
      this.assets = finishAsset(this.assets, key)
      this.notify(true)
    }
  }

  private step(key: AssetKey, loaded: number, total: number | undefined): void {
    this.assets = reportAsset(this.assets, key, loaded, total)
    this.notify(false)
  }

  private notify(force: boolean): void {
    const p = summarize(this.assets)
    if (!force && p.ratio - this.reported < PROGRESS_STEP) return
    this.reported = p.ratio
    this.onChange?.(p)
  }
}
