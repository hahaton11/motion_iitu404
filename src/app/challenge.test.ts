import { describe, expect, it } from 'vitest'
import {
  CHECKS_TOTAL,
  CLUSTERS,
  evaluate,
  fitZoom,
  formatTime,
  IDEAS,
  ideaElementId,
  inTrash,
  nearMissCluster,
  progress,
  scoreOf,
  seedLayout,
  STICKER_SIZE,
  timeLeft,
  TRASH,
  type CheckedElement,
  type ClusterId,
} from './challenge'
import { centerIn } from './zones'

const S = STICKER_SIZE
const centerOf = (id: ClusterId) => {
  const r = CLUSTERS.find((c) => c.id === id)?.rect
  if (!r) throw new Error(id)
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
}

/** Идеальная раскладка: полезные в своих зонах, лишних нет, плюс один новый. */
function perfectBoard(): CheckedElement[] {
  const useful = IDEAS.filter((i) => i.target !== 'trash').map((i) => ({
    id: ideaElementId(i),
    ...centerOf(i.target as ClusterId),
    w: S,
    h: S,
  }))
  return [...useful, { id: 'pk-new', ...centerOf('comms'), w: S, h: S }]
}

const seeded = (): CheckedElement[] => seedLayout().map((s) => ({ id: s.id, x: s.x, y: s.y, w: S, h: S }))

describe('challenge data', () => {
  it('12 ideas: 9 useful, 3 per cluster, 3 extra', () => {
    expect(IDEAS).toHaveLength(12)
    expect(IDEAS.filter((i) => i.target === 'trash')).toHaveLength(3)
    CLUSTERS.forEach((c) => expect(IDEAS.filter((i) => i.target === c.id)).toHaveLength(3))
  })

  it('the starting pile is outside every cluster and the trash', () => {
    seeded().forEach((el) => {
      expect(CLUSTERS.some((c) => centerIn(c.rect, el))).toBe(false)
      expect(inTrash(el)).toBe(false)
    })
  })

  it('fitZoom keeps the layout inside the screen', () => {
    expect(fitZoom(1480, 920)).toBe(1)
    expect(fitZoom(1280, 720)).toBeCloseTo(720 / 920)
  })
})

describe('evaluate', () => {
  it('perfect board is 100%', () => {
    const e = evaluate(perfectBoard())
    expect(e).toMatchObject({ placed: 9, discarded: 3, added: true, accuracy: 100, perfect: true, total: CHECKS_TOTAL })
  })

  it('untouched board: only nothing is right', () => {
    const e = evaluate(seeded())
    expect(e).toMatchObject({ placed: 0, discarded: 0, added: false, correct: 0, accuracy: 0, perfect: false })
  })

  it('wrong cluster does not count, removed useful idea does not count', () => {
    const board = perfectBoard()
      .map((el) => (el.id === ideaElementId(IDEAS[0]!) ? { ...el, ...centerOf('life') } : el))
      .filter((el) => el.id !== ideaElementId(IDEAS[1]!))
    const e = evaluate(board)
    expect(e.placed).toBe(7)
    expect(e.accuracy).toBe(Math.round((100 * 11) / 13))
  })

  it('an extra idea left on the board is a miss', () => {
    const extra = IDEAS.find((i) => i.target === 'trash')!
    const e = evaluate([...perfectBoard(), { id: ideaElementId(extra), x: 0, y: 200, w: S, h: S }])
    expect(e.discarded).toBe(2)
  })

  it('a new element outside clusters is not counted as added', () => {
    const board = perfectBoard().map((el) => (el.id === 'pk-new' ? { ...el, x: 0, y: 200 } : el))
    expect(evaluate(board).added).toBe(false)
  })
})

describe('progress and helpers', () => {
  it('neutral progress counts elements in clusters and removed seeds', () => {
    const board = seeded().slice(2)
    expect(progress(board)).toEqual({ inClusters: 0, removed: 2, added: false })
    expect(progress(perfectBoard())).toEqual({ inClusters: 10, removed: 3, added: true })
  })

  it('near miss: edge inside a cluster, center outside', () => {
    const r = CLUSTERS[0]!.rect
    expect(nearMissCluster({ x: r.left + 40, y: r.bottom + 30, w: S, h: S })).toBe(true)
    expect(nearMissCluster({ x: r.left + 40, y: r.bottom - 30, w: S, h: S })).toBe(false)
    expect(nearMissCluster({ x: 0, y: 250, w: S, h: S })).toBe(false)
  })

  it('trash check', () => {
    expect(inTrash({ x: (TRASH.left + TRASH.right) / 2, y: TRASH.top + 10, w: S, h: S })).toBe(true)
  })

  it('score rewards accuracy, time left and fewer hints, never negative', () => {
    expect(scoreOf(100, 60_000, 0, 180_000)).toBe(1000 + 120 * 2)
    expect(scoreOf(100, 60_000, 2, 180_000)).toBe(1240 - 10)
    expect(scoreOf(0, 999_999, 50)).toBe(0)
    expect(scoreOf(0, 1_000, 0, 180_000)).toBe(0)
    expect(scoreOf(50, 60_000, 0, 180_000)).toBe(500 + 120)
  })

  it('time helpers', () => {
    expect(formatTime(83_500)).toBe('1:23')
    expect(formatTime(5_000)).toBe('0:05')
    expect(formatTime(-1)).toBe('0:00')
    expect(timeLeft(200_000, 180_000)).toBe(0)
  })
})
