/**
 * Таблица рекордов. Чистые функции над списком, хранилище внедряется: в браузере localStorage,
 * в тестах объект в памяти. Данные из хранилища недоверенные и проверяются при чтении.
 */

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface GameRecord {
  readonly id: string
  readonly name: string
  readonly score: number
  readonly accuracy: number
  readonly timeMs: number
  readonly hints: number
  /** Время игры, мс с эпохи. */
  readonly at: number
}

export const RECORDS_KEY = 'motion-board-records'
export const MAX_RECORDS = 10
export const MAX_NAME_LENGTH = 24
export const DEFAULT_NAME = 'Игрок'

export const NICKNAMES: readonly string[] = [
  'Тони Жест',
  'Ладонь Грома',
  'Мастер Кулака',
  'Быстрая Рука',
  'Капитан Стикер',
  'Повелитель Кармана',
  'Тихий Бросок',
  'Мудрый Прицел',
  'Звёздная Ладонь',
]

/** Лучше тот, у кого больше очков; при равенстве быстрее; затем раньше. */
export function compareRecords(a: GameRecord, b: GameRecord): number {
  return b.score - a.score || a.timeMs - b.timeMs || a.at - b.at
}

export function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
  return name || DEFAULT_NAME
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parseRecord(raw: unknown): GameRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return undefined
  if (![r.score, r.accuracy, r.timeMs, r.hints, r.at].every(isNum)) return undefined
  return {
    id: r.id,
    name: cleanName(r.name),
    score: r.score as number,
    accuracy: Math.min(100, Math.max(0, r.accuracy as number)),
    timeMs: r.timeMs as number,
    hints: r.hints as number,
    at: r.at as number,
  }
}

export function parseRecords(json: string | null): readonly GameRecord[] {
  if (!json) return []
  try {
    const data: unknown = JSON.parse(json)
    if (!Array.isArray(data)) return []
    const list = data.map(parseRecord).filter((r): r is GameRecord => r !== undefined)
    return [...list].sort(compareRecords).slice(0, MAX_RECORDS)
  } catch {
    return []
  }
}

export function loadRecords(store: KeyValueStore): readonly GameRecord[] {
  try {
    return parseRecords(store.getItem(RECORDS_KEY))
  } catch {
    return []
  }
}

/** Запись может не удаться (приватный режим, квота): рекорды тогда живут до перезагрузки. */
export function saveRecords(store: KeyValueStore, list: readonly GameRecord[]): boolean {
  try {
    store.setItem(RECORDS_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

export interface AddResult {
  readonly list: readonly GameRecord[]
  /** Место с единицы или undefined, если в таблицу не попал. */
  readonly rank: number | undefined
}

export function addRecord(list: readonly GameRecord[], record: GameRecord): AddResult {
  const next = [...list.filter((r) => r.id !== record.id), record].sort(compareRecords).slice(0, MAX_RECORDS)
  const index = next.findIndex((r) => r.id === record.id)
  return { list: next, rank: index < 0 ? undefined : index + 1 }
}

export function renameRecord(list: readonly GameRecord[], id: string, name: string): readonly GameRecord[] {
  return list.some((r) => r.id === id) ? list.map((r) => (r.id === id ? { ...r, name: cleanName(name) } : r)) : list
}

/** Три разных прозвища, выбор зависит от seed, чтобы в каждой игре были новые. */
export function nicknameOptions(seed: number, count = 3): readonly string[] {
  const n = NICKNAMES.length
  const start = ((Math.floor(seed) % n) + n) % n
  return Array.from({ length: Math.min(count, n) }, (_, i) => NICKNAMES[(start + i * 4) % n] ?? DEFAULT_NAME)
}
