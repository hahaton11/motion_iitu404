import { describe, expect, it } from 'vitest'
import type { CursorEvt } from '../contracts/input'
import type { Pose } from '../gestures/model'
import { initialPipeline, processFrame, withCarrying, type OutEvent, type PipelineState } from './pipeline'
import { POSES, syntheticHand } from './testing/synthetic-hand'

const FRAME_MS = 1000 / 30

/** Кадр: поза классификатора и x запястья в кадре (не зеркальный). null — руки нет. */
type F = readonly [Pose, number] | null

const hand = ([label, x]: readonly [Pose, number]) => ({
  ...syntheticHand(POSES.open, { hand: 'right', wrist: { x, y: 0.75 } }),
  pose: { label, confidence: 0.95 },
})

/** Потребитель как доска: на grab берёт элемент в руку, если takes. */
const run = (frames: readonly F[], takes = true) => {
  let state: PipelineState = initialPipeline()
  const events: OutEvent[] = []
  frames.forEach((f, i) => {
    const r = processFrame(state, { t: i * FRAME_MS, hands: f ? [hand(f)] : [] })
    state = r.state
    events.push(...r.events)
    if (takes && r.events.some((e) => e.type === 'grab')) state = withCarrying(state, 'right', true)
  })
  return { state, events }
}

const still = (pose: Pose, k: number, x = 0.5): F[] => Array.from({ length: k }, () => [pose, x] as const)
const sweep = (pose: Pose, k: number, from: number, step: number): F[] =>
  Array.from({ length: k }, (_, i) => [pose, from + i * step] as const)
/** События захвата: взмахи pipeline шлёт и с элементом в руке, здесь они не в счёт. */
const HOLD_TYPES: ReadonlySet<string> = new Set(['grab', 'release', 'throw', 'handlost'])
const gestureEventTypes = (events: readonly OutEvent[]): string[] => events.map((e) => e.type).filter((t) => HOLD_TYPES.has(t))
const cursors = (events: readonly OutEvent[]): CursorEvt[] => events.flatMap((e) => (e.type === 'cursor' ? [e.e] : []))
const hintCodes = (events: readonly OutEvent[]): string[] => events.flatMap((e) => (e.type === 'hint' ? [e.e.code] : []))

/** Подойти ладонью, сжать кулак, раскрыть: элемент несётся. */
const PICK: F[] = [...still('open', 6), ...still('fist', 8), ...still('open', 8)]

describe('processFrame: carrying a stuck element', () => {
  it('opening the grab fist keeps the element and the cursor reports holding', () => {
    const r = run([...PICK, ...still('open', 30), ...still('idle', 30)])
    expect(gestureEventTypes(r.events)).toEqual(['grab'])
    expect(cursors(r.events).pop()?.holding).toBe(true)
  })

  it('a fist on empty space is released by an open palm as before', () => {
    expect(gestureEventTypes(run(PICK, false).events)).toEqual(['grab', 'release'])
  })

  it('fist then a quick open in place releases', () => {
    const r = run([...PICK, ...still('fist', 8), ...still('open', 8)])
    expect(gestureEventTypes(r.events)).toEqual(['grab', 'release'])
    expect(cursors(r.events).pop()?.holding).toBe(false)
  })

  it('fist then a quick open on the move throws', () => {
    const fist = still('fist', 6, 0.8)
    const fling = sweep('fist', 3, 0.8, -0.1)
    const open = sweep('open', 4, 0.5, -0.1)
    expect(gestureEventTypes(run([...PICK, ...still('open', 6, 0.8), ...fist, ...fling, ...open]).events)).toEqual(['grab', 'throw'])
  })

  it('a fast carry without the fist gesture does not throw and suggests how to throw', () => {
    const r = run([...PICK, ...sweep('open', 8, 0.85, -0.1), ...still('open', 20, 0.05)])
    expect(gestureEventTypes(r.events)).toEqual(['grab'])
    expect(hintCodes(r.events)).toContain('CARRY_THROW_HOW')
  })

  it('pinch and two fingers neither zoom nor pan while carrying', () => {
    const r = run([...PICK, ...still('pinch', 10), ...sweep('pinch', 10, 0.5, 0.01), ...still('victory', 10), ...sweep('victory', 10, 0.6, -0.01)])
    expect(r.events.filter((e) => e.type === 'zoom' || e.type === 'pan')).toEqual([])
    expect(gestureEventTypes(r.events)).toEqual(['grab'])
  })

  it('an open palm held with the element suggests how to put it down', () => {
    expect(hintCodes(run([...PICK, ...still('open', 130)]).events)).toContain('CARRY_PUT_HOW')
  })

  it('the consumer taking the element away frees the hand without a release', () => {
    const before = run([...PICK, ...still('open', 4)])
    const freed = withCarrying(before.state, 'right', false)
    let state = freed
    const events: OutEvent[] = []
    still('open', 6).forEach((f, i) => {
      const r = processFrame(state, { t: (40 + i) * FRAME_MS, hands: f ? [hand(f)] : [] })
      state = r.state
      events.push(...r.events)
    })
    expect(gestureEventTypes(events)).toEqual([])
    expect(cursors(events).pop()?.holding).toBe(false)
  })

  it('drops the element in place when the hand is lost mid-carry', () => {
    const r = run([...PICK, ...sweep('open', 5, 0.8, -0.1), ...Array<F>(12).fill(null)])
    expect(gestureEventTypes(r.events)).toEqual(['grab', 'release', 'handlost'])
    const release = r.events.find((e) => e.type === 'release')
    expect(release?.type === 'release' && release.e.vx).toBe(0)
  })
})
