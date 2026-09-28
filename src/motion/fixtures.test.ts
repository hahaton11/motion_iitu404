import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { encodeHand, gestureEventTypes, parseFixture, runFixture, type Fixture } from './fixtures'
import { POSES, syntheticHand, type FingerCurls } from './testing/synthetic-hand'

const FRAME_MS = 1000 / 30
const FIXTURE_DIR = fileURLToPath(new URL('../../test-assets/fixtures', import.meta.url))

const syntheticFixture = (poses: readonly FingerCurls[]): Fixture => ({
  name: 'synthetic',
  frames: poses.map((p, i) => {
    const h = syntheticHand(p)
    // Метка 'Left' от MediaPipe соответствует правой руке пользователя в незеркальном кадре.
    return { t: i * FRAME_MS, hands: [encodeHand({ label: 'Left', score: h.score, landmarks: h.landmarks, world: h.world })] }
  }),
})

describe('fixture format', () => {
  it('round-trips through JSON and reproduces gestures', () => {
    const fx = syntheticFixture([...Array(5).fill(POSES.open), ...Array(5).fill(POSES.grab), ...Array(5).fill(POSES.open)])
    const parsed = parseFixture(JSON.parse(JSON.stringify(fx)))
    expect(gestureEventTypes(runFixture(parsed))).toEqual(['grab', 'release'])
  })

  it('assigns the hand id from the label', () => {
    const events = runFixture(syntheticFixture(Array(3).fill(POSES.open)))
    const cursor = events.find((e) => e.type === 'cursor')!
    expect(cursor.type === 'cursor' && cursor.e.hand).toBe('right')
  })

  it('rejects malformed data with a reason', () => {
    expect(() => parseFixture({ name: 'x', frames: [{ t: 0, hands: [{ label: 'Left' }] }] })).toThrow(/frame 0/)
    expect(() => parseFixture(null)).toThrow()
  })
})

const recorded = existsSync(FIXTURE_DIR) ? readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json')) : []

describe('recorded fixtures', () => {
  it.skipIf(recorded.length > 0)('no recordings yet, synthetic poses cover the logic', () => {
    expect(recorded).toEqual([])
  })

  it.each(recorded)('%s produces the expected gesture events', (file) => {
    const fx = parseFixture(JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8')))
    const types = gestureEventTypes(runFixture(fx))
    if (fx.expected) expect(types).toEqual(fx.expected)
    else expect(Array.isArray(types)).toBe(true)
  })
})
