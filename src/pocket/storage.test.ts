import { describe, expect, it } from 'vitest'
import { makeItem } from './model'
import { memoryStore, openPocketStore } from './storage'

describe('pocket storage', () => {
  it('falls back to memory without IndexedDB and seeds defaults', async () => {
    const store = await openPocketStore()
    expect(store.persistent).toBe(false)
    const items = await store.load()
    expect(items.filter((i) => i.content.kind === 'sticky')).toHaveLength(4)
    expect(items.filter((i) => i.content.kind === 'image')).toHaveLength(1)
    expect(items.every((i) => i.type === 'preset')).toBe(true)
  })

  it('keeps saved items and resets to defaults', async () => {
    const store = memoryStore()
    await store.save([makeItem('a', 'stash', { kind: 'rect' }, 1)])
    expect((await store.load()).map((i) => i.id)).toEqual(['a'])
    expect(await store.reset()).toHaveLength(7)
  })
})
