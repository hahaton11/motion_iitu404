import { describe, expect, it, vi } from 'vitest'
import type { InputSource } from '../contracts/input'
import { InputEmitter } from '../shared/emitter'
import { DWELL_MS, initialDwell, OPEN_CLOSURE, stepDwell, type DwellState } from './dwell'
import { InputHub } from './input-hub'

class FakeSource implements InputSource {
  readonly em = new InputEmitter()
  stopped = false
  on: InputSource['on'] = (type, fn) => this.em.on(type, fn)
  start = async (): Promise<void> => undefined
  stop(): void {
    this.stopped = true
  }
}

const cursor = { hand: 'right', x: 0.5, y: 0.5, closure: 0, holding: false } as const

describe('InputHub', () => {
  it('raw always gets events, board only while open', () => {
    const hub = new InputHub()
    const src = new FakeSource()
    hub.use(src)
    const raw = vi.fn()
    const board = vi.fn()
    hub.raw.on('grab', raw)
    hub.board.on('grab', board)
    src.em.emit('grab', { hand: 'right', x: 0, y: 0 })
    hub.setBoardOpen(true)
    src.em.emit('grab', { hand: 'right', x: 0, y: 0 })
    expect(raw).toHaveBeenCalledTimes(2)
    expect(board).toHaveBeenCalledTimes(1)
  })

  it('hints never reach the board channel', () => {
    const hub = new InputHub()
    const src = new FakeSource()
    hub.use(src)
    hub.setBoardOpen(true)
    const board = vi.fn()
    const raw = vi.fn()
    hub.board.on('hint', board)
    hub.raw.on('hint', raw)
    src.em.emit('hint', { code: 'NO_HAND', message: 'm', severity: 'info' })
    expect(board).not.toHaveBeenCalled()
    expect(raw).toHaveBeenCalledOnce()
  })

  it('closing the board sends handlost for seen hands', () => {
    const hub = new InputHub()
    const src = new FakeSource()
    hub.use(src)
    hub.setBoardOpen(true)
    const lost = vi.fn()
    hub.board.on('handlost', lost)
    src.em.emit('cursor', cursor)
    hub.setBoardOpen(false)
    expect(lost).toHaveBeenCalledWith({ hand: 'right' })
  })

  it('switching sources stops the old one and forwards only the new', () => {
    const hub = new InputHub()
    const a = new FakeSource()
    const b = new FakeSource()
    const fn = vi.fn()
    hub.raw.on('cursor', fn)
    hub.use(a)
    hub.use(b)
    expect(a.stopped).toBe(true)
    a.em.emit('cursor', cursor)
    b.em.emit('cursor', cursor)
    expect(fn).toHaveBeenCalledOnce()
    expect(hub.current).toBe(b)
  })
})

describe('dwell', () => {
  const step = (s: DwellState, target: string | undefined, t: number, closure = 0) => stepDwell(s, { target, closure, t })

  it('fires after holding an open palm for the dwell time', () => {
    let s = step(initialDwell(), 'go', 0).state
    const half = step(s, 'go', DWELL_MS / 2)
    expect(half.progress).toBeCloseTo(0.5)
    s = half.state
    const r = step(s, 'go', DWELL_MS)
    expect(r.fire).toBe('go')
  })

  it('fires once until the cursor leaves the button', () => {
    let s = step(initialDwell(), 'go', 0).state
    s = step(s, 'go', DWELL_MS).state
    expect(step(s, 'go', DWELL_MS * 3).fire).toBeUndefined()
    s = step(s, undefined, DWELL_MS * 3).state
    s = step(s, 'go', DWELL_MS * 4).state
    expect(step(s, 'go', DWELL_MS * 5).fire).toBe('go')
  })

  it('a fist resets the timer, switching buttons restarts it', () => {
    let s = step(initialDwell(), 'a', 0).state
    s = step(s, 'a', 800, OPEN_CLOSURE + 0.1).state
    expect(step(s, 'a', 1000).fire).toBeUndefined()
    s = step(s, 'b', 1000).state
    expect(step(s, 'b', 1500).progress).toBeCloseTo(0.5)
  })
})
