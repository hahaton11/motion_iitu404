import { describe, expect, it, vi } from 'vitest'
import { Emitter } from './events'

describe('Emitter', () => {
  it('delivers by type and stops after unsubscribe', () => {
    const em = new Emitter<{ a: number; b: string }>()
    const a = vi.fn()
    const b = vi.fn()
    const off = em.on('a', a)
    em.on('b', b)
    em.emit('a', 1)
    off()
    em.emit('a', 2)
    expect(a).toHaveBeenCalledTimes(1)
    expect(a).toHaveBeenCalledWith(1)
    expect(b).not.toHaveBeenCalled()
  })
})
