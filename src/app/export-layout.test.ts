import { describe, expect, it } from 'vitest'
import { contentBounds, exportFileName, exportScale, wrapText } from './export-layout'
import { rect } from './zones'

const mono = (s: string) => s.length * 10

describe('export layout', () => {
  it('bounds cover elements and zones with padding', () => {
    const b = contentBounds([{ x: 0, y: 0, w: 100, h: 100 }], [rect(200, -10, 300, 20)], 10)
    expect(b).toEqual({ left: -60, top: -60, right: 310, bottom: 60 })
  })

  it('empty board still has a canvas', () => {
    const b = contentBounds([], [], 0)
    expect(b.right - b.left).toBeGreaterThan(0)
  })

  it('scale is capped by the longest side', () => {
    expect(exportScale(rect(0, 0, 500, 100), 2400, 2)).toBe(2)
    expect(exportScale(rect(0, 0, 4800, 100), 2400, 2)).toBe(0.5)
  })

  it('wraps by words and splits a long word', () => {
    expect(wrapText('один два три', 70, mono)).toEqual(['один', 'два три'])
    expect(wrapText('абвгдежзик', 50, mono)).toEqual(['абвгд', 'ежзик'])
    expect(wrapText('', 50, mono)).toEqual([])
  })

  it('limits lines with an ellipsis', () => {
    expect(wrapText('a b c d', 10, mono, 2)).toEqual(['a', 'b…'])
  })

  it('file name from date', () => {
    expect(exportFileName(new Date(2026, 8, 30, 14, 5))).toBe('motion-board-2026-09-30-1405.png')
  })
})
