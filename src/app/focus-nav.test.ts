import { describe, expect, it } from 'vitest'
import { nearest, nextInDirection, stepPoint } from './focus-nav'

const t = (id: string, x: number, y: number) => ({ id, x, y })

describe('nextInDirection', () => {
  const grid = [t('a', 0.2, 0.3), t('b', 0.5, 0.3), t('c', 0.8, 0.3), t('d', 0.5, 0.7), t('e', 0.8, 0.75)]

  it('goes to the neighbour in the swipe direction', () => {
    expect(nextInDirection(grid[1]!, 'right', grid, 'b')?.id).toBe('c')
    expect(nextInDirection(grid[1]!, 'left', grid, 'b')?.id).toBe('a')
    expect(nextInDirection(grid[1]!, 'down', grid, 'b')?.id).toBe('d')
  })

  it('prefers a straight neighbour over a closer diagonal one', () => {
    expect(nextInDirection(t('d', 0.5, 0.7), 'right', grid, 'd')?.id).toBe('e')
    const row = [t('s', 0.1, 0.5), t('far', 0.6, 0.5), t('diag', 0.35, 0.8)]
    expect(nextInDirection(row[0]!, 'right', row, 's')?.id).toBe('far')
  })

  it('returns nothing at the edge', () => {
    expect(nextInDirection(grid[2]!, 'right', grid, 'c')).toBeUndefined()
    expect(nextInDirection(grid[0]!, 'up', grid, 'a')).toBeUndefined()
  })
})

describe('nearest', () => {
  it('finds the closest point', () => {
    expect(nearest({ x: 0.45, y: 0.65 }, [t('a', 0.2, 0.3), t('d', 0.5, 0.7)])?.id).toBe('d')
  })
})

describe('stepPoint', () => {
  it('steps in the direction and keeps the margin', () => {
    expect(stepPoint({ x: 0.5, y: 0.5 }, 'right').x).toBeCloseTo(0.68)
    expect(stepPoint({ x: 0.85, y: 0.5 }, 'right').x).toBeCloseTo(0.92)
    expect(stepPoint({ x: 0.5, y: 0.2 }, 'up').y).toBeCloseTo(0.08)
  })
})
