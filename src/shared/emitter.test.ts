import { describe, expect, it, vi } from 'vitest'
import { InputEmitter } from './emitter'

describe('InputEmitter', () => {
  it('delivers events to subscribers of the same type only', () => {
    const em = new InputEmitter()
    const grab = vi.fn()
    const release = vi.fn()
    em.on('grab', grab)
    em.on('release', release)

    em.emit('grab', { hand: 'right', x: 0.5, y: 0.5 })

    expect(grab).toHaveBeenCalledWith({ hand: 'right', x: 0.5, y: 0.5 })
    expect(release).not.toHaveBeenCalled()
  })

  it('stops delivering after unsubscribe', () => {
    const em = new InputEmitter()
    const fn = vi.fn()
    const off = em.on('handlost', fn)

    off()
    em.emit('handlost', { hand: 'left' })

    expect(fn).not.toHaveBeenCalled()
  })
})
