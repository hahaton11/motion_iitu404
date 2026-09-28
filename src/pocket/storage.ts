import { parseItem, sortItems, type PocketItem } from './model'
import { defaultItems } from './presets'

/**
 * Хранилище кармана в IndexedDB. При первом запуске кладёт заготовки по умолчанию.
 * Если IndexedDB недоступна (приватный режим, запрет), карман живёт в памяти до перезагрузки.
 */
export interface PocketStore {
  /** Содержимое кармана, новые первыми. На первом запуске — заготовки по умолчанию. */
  load(): Promise<readonly PocketItem[]>
  /** Полностью заменяет содержимое. Записи идут по очереди, последняя побеждает. */
  save(items: readonly PocketItem[]): Promise<void>
  /** Вернуть заготовки по умолчанию, убрав всё остальное. */
  reset(): Promise<readonly PocketItem[]>
  readonly persistent: boolean
}

export const DB_NAME = 'motion-board-pocket'
export const DB_VERSION = 1
const ITEMS = 'items'
const META = 'meta'
const SEEDED_KEY = 'seeded'

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'))
  })

const txDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })

function openDb(): Promise<IDBDatabase> {
  const open = indexedDB.open(DB_NAME, DB_VERSION)
  open.onupgradeneeded = () => {
    const db = open.result
    if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: 'id' })
    if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
  }
  return req(open)
}

async function writeAll(db: IDBDatabase, items: readonly PocketItem[]): Promise<void> {
  const tx = db.transaction([ITEMS, META], 'readwrite')
  const store = tx.objectStore(ITEMS)
  store.clear()
  items.forEach((item) => store.put(item))
  tx.objectStore(META).put(true, SEEDED_KEY)
  await txDone(tx)
}

async function readAll(db: IDBDatabase): Promise<{ readonly seeded: boolean; readonly items: readonly PocketItem[] }> {
  const tx = db.transaction([ITEMS, META], 'readonly')
  const [raw, seeded] = await Promise.all([req(tx.objectStore(ITEMS).getAll()), req(tx.objectStore(META).get(SEEDED_KEY))])
  const items = (raw as unknown[]).map(parseItem).filter((i): i is PocketItem => i !== undefined)
  return { seeded: seeded === true, items: sortItems(items) }
}

class IdbStore implements PocketStore {
  readonly persistent = true
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly db: IDBDatabase) {}

  async load(): Promise<readonly PocketItem[]> {
    const { seeded, items } = await readAll(this.db)
    if (seeded) return items
    return this.reset()
  }

  save(items: readonly PocketItem[]): Promise<void> {
    const snapshot = [...items]
    this.queue = this.queue.catch(() => undefined).then(() => writeAll(this.db, snapshot))
    return this.queue
  }

  async reset(): Promise<readonly PocketItem[]> {
    const items = defaultItems(Date.now())
    await this.save(items)
    return items
  }
}

class MemoryStore implements PocketStore {
  readonly persistent = false
  private items: readonly PocketItem[] | undefined

  async load(): Promise<readonly PocketItem[]> {
    return this.items ?? this.reset()
  }

  async save(items: readonly PocketItem[]): Promise<void> {
    this.items = [...items]
  }

  async reset(): Promise<readonly PocketItem[]> {
    this.items = defaultItems(Date.now())
    return this.items
  }
}

export const memoryStore = (): PocketStore => new MemoryStore()

/** Открывает IndexedDB, при ошибке отдаёт хранилище в памяти. */
export async function openPocketStore(): Promise<PocketStore> {
  if (typeof indexedDB === 'undefined') return memoryStore()
  try {
    return new IdbStore(await openDb())
  } catch {
    return memoryStore()
  }
}
