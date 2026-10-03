import { describe, expect, it } from 'vitest'
import { tipTarget } from './tip-target'

describe('tipTarget', () => {
  it('prefers the hovered sticky over the selected one', () => {
    expect(tipTarget({ hovered: ['a'], selectedId: 'b' })).toBe('a')
  })

  it('falls back to the selected sticky', () => {
    expect(tipTarget({ hovered: [], selectedId: 'b' })).toBe('b')
  })

  it('shows nothing without a sticky', () => {
    expect(tipTarget({ hovered: [] })).toBeUndefined()
  })

  it('hides while something is held or recording', () => {
    expect(tipTarget({ hovered: ['a'], heldId: 'a' })).toBeUndefined()
    expect(tipTarget({ hovered: ['a'], selectedId: 'a', recordingId: 'a' })).toBeUndefined()
  })
})
