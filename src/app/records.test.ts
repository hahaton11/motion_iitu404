import { describe, expect, it } from 'vitest'
import {
  addRecord,
  cleanName,
  DEFAULT_NAME,
  loadRecords,
  MAX_RECORDS,
  nicknameOptions,
  parseRecords,
  RECORDS_KEY,
  renameRecord,
  saveRecords,
  type GameRecord,
  type KeyValueStore,
} from './records'

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

const rec = (id: string, score: number, timeMs = 60_000, at = 0): GameRecord => ({
  id,
  name: id,
  score,
  accuracy: 90,
  timeMs,
  hints: 1,
  at,
})

describe('records', () => {
  it('survive a save and a new load, as after a page reload', () => {
    const store = memory()
    const { list } = addRecord([], rec('a', 500))
    expect(saveRecords(store, list)).toBe(true)
    expect(loadRecords(store)).toEqual(list)
  })

  it('sorted by score, then faster time, and ranked', () => {
    let list: readonly GameRecord[] = []
    list = addRecord(list, rec('a', 500)).list
    list = addRecord(list, rec('b', 900)).list
    const r = addRecord(list, rec('c', 500, 30_000))
    expect(r.list.map((x) => x.id)).toEqual(['b', 'c', 'a'])
    expect(r.rank).toBe(2)
  })

  it(`keeps only ${MAX_RECORDS}; a weak result gets no rank`, () => {
    const full = Array.from({ length: MAX_RECORDS }, (_, i) => rec(`r${i}`, 1000 + i)).reduce<readonly GameRecord[]>(
      (l, r) => addRecord(l, r).list,
      [],
    )
    const r = addRecord(full, rec('weak', 1))
    expect(r.list).toHaveLength(MAX_RECORDS)
    expect(r.rank).toBeUndefined()
  })

  it('rename changes only that record and does not mutate', () => {
    const list = addRecord([], rec('a', 10)).list
    const renamed = renameRecord(list, 'a', '  Капитан   Жест ')
    expect(renamed[0]?.name).toBe('Капитан Жест')
    expect(list[0]?.name).toBe('a')
    expect(renameRecord(list, 'nope', 'x')).toBe(list)
  })

  it('bad storage data is ignored', () => {
    expect(parseRecords('not json')).toEqual([])
    expect(parseRecords('{"a":1}')).toEqual([])
    expect(parseRecords(JSON.stringify([{ id: 'x' }, rec('ok', 5)]))).toHaveLength(1)
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(loadRecords(throwing)).toEqual([])
    expect(saveRecords(throwing, [])).toBe(false)
  })

  it('stored under its own key', () => {
    const store = memory()
    saveRecords(store, [rec('a', 1)])
    expect(store.data.has(RECORDS_KEY)).toBe(true)
  })

  it('names are trimmed, capped and never empty', () => {
    expect(cleanName('   ')).toBe(DEFAULT_NAME)
    expect(cleanName('x'.repeat(100))).toHaveLength(24)
  })

  it('three different nicknames for any seed', () => {
    ;[0, 1, 7, 123, -5].forEach((seed) => {
      const opts = nicknameOptions(seed)
      expect(opts).toHaveLength(3)
      expect(new Set(opts).size).toBe(3)
    })
  })
})
