import { describe, expect, it } from 'vitest'
import {
  currentStep,
  initialTutorial,
  panCentered,
  progressLabel,
  stepTutorial,
  TUTORIAL_HINTS,
  TUTORIAL_PAN_TARGET,
  TUTORIAL_STEPS,
  TUTORIAL_ZOOM_GOAL,
  type TutorialEvent,
  type TutorialState,
} from './tutorial'

const run = (s: TutorialState, ...events: TutorialEvent[]): TutorialState =>
  events.reduce((acc, e) => stepTutorial(acc, e).state, s)

/** Состояние на шаге с заданным id: шаги до него пропускаются. */
const at = (id: string): TutorialState => {
  const i = TUTORIAL_STEPS.findIndex((s) => s.id === id)
  return run(initialTutorial(), ...Array.from({ length: i }, (): TutorialEvent => ({ type: 'skip' })))
}

describe('tutorial', () => {
  it('has seven steps: element, then board, then pocket and voice', () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual(['move', 'throw', 'pan', 'zoom', 'take', 'put', 'voice'])
  })

  it('passes all steps with the right actions and finishes', () => {
    const s = run(
      initialTutorial(),
      { type: 'drop', inFrame: true },
      { type: 'throw' },
      { type: 'panned', centered: true },
      { type: 'zoomed', reached: true },
      { type: 'take' },
      { type: 'put' },
    )
    expect(currentStep(s)?.id).toBe('voice')
    const last = stepTutorial(s, { type: 'dictated' })
    expect(last.reaction).toEqual({ kind: 'finish' })
    expect(last.state.done).toBe(true)
  })

  it('advance reaction on intermediate steps', () => {
    expect(stepTutorial(initialTutorial(), { type: 'drop', inFrame: true }).reaction).toEqual({ kind: 'advance' })
  })

  it('drop outside the frame hints and stays on the step', () => {
    const r = stepTutorial(initialTutorial(), { type: 'drop', inFrame: false })
    expect(r.reaction).toEqual({ kind: 'hint', hint: TUTORIAL_HINTS.DROP_IN_FRAME, respawn: false })
    expect(r.state.index).toBe(0)
    expect(r.state.mistakes).toBe(1)
  })

  it('throw on the move step hints and respawns the sticker', () => {
    const r = stepTutorial(initialTutorial(), { type: 'throw' })
    expect(r.reaction).toEqual({ kind: 'hint', hint: TUTORIAL_HINTS.NO_THROW, respawn: true })
  })

  it('throw step: a soft drop asks for a sharper throw, a pocket put respawns', () => {
    const s = at('throw')
    expect(stepTutorial(s, { type: 'drop', inFrame: false }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.THROW_FASTER })
    expect(stepTutorial(s, { type: 'put' }).reaction).toMatchObject({ respawn: true })
  })

  it('pan step: the board moved but the mark is not centered yet, so the step waits', () => {
    const s = at('pan')
    const short = stepTutorial(s, { type: 'panned', centered: false })
    expect(short.reaction).toEqual({ kind: 'hint', hint: TUTORIAL_HINTS.PAN_FARTHER, respawn: false })
    expect(currentStep(short.state)?.id).toBe('pan')
    expect(stepTutorial(s, { type: 'panned', centered: true }).reaction).toEqual({ kind: 'advance' })
  })

  it('pan step: a fist says the board is moved with two fingers', () => {
    const s = at('pan')
    expect(stepTutorial(s, { type: 'grab' }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.PAN_TWO_FINGERS })
    expect(stepTutorial(s, { type: 'throw' }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.PAN_TWO_FINGERS })
  })

  it('zoom step: too small a zoom asks to lead the pinch higher', () => {
    const s = at('zoom')
    expect(stepTutorial(s, { type: 'zoomed', reached: false }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.ZOOM_UP })
    expect(stepTutorial(s, { type: 'zoomed', reached: true }).reaction).toEqual({ kind: 'advance' })
    expect(stepTutorial(s, { type: 'grab' }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.ZOOM_PINCH })
  })

  it('navigation events outside their steps change nothing', () => {
    expect(stepTutorial(at('move'), { type: 'panned', centered: true }).reaction).toEqual({ kind: 'none' })
    expect(stepTutorial(at('pan'), { type: 'zoomed', reached: true }).reaction).toEqual({ kind: 'none' })
    expect(stepTutorial(at('zoom'), { type: 'panned', centered: true }).reaction).toEqual({ kind: 'none' })
  })

  it('the pan target sits off to the right and its own center is not centered', () => {
    expect(TUTORIAL_PAN_TARGET.left).toBeGreaterThan(0)
    expect(panCentered({ x: 0.5, y: 0.5 })).toBe(true)
    expect(panCentered({ x: 0.88, y: 0.5 })).toBe(false)
    expect(panCentered({ x: 0.5, y: 0.95 })).toBe(false)
  })

  it('the zoom step asks for a real zoom, not a nudge', () => {
    expect(TUTORIAL_ZOOM_GOAL).toBeGreaterThan(1.2)
  })

  it('take step: grabbing a board element suggests opening the pocket', () => {
    const s = at('take')
    expect(stepTutorial(s, { type: 'grab' }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.OPEN_POCKET })
    expect(stepTutorial(s, { type: 'drop', inFrame: false }).reaction).toEqual({ kind: 'none' })
  })

  it('put step: throw and board drop give different hints', () => {
    const s = at('put')
    expect(stepTutorial(s, { type: 'throw' }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.PUT_NO_THROW, respawn: true })
    expect(stepTutorial(s, { type: 'drop', inFrame: false }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.PUT_LOWER })
  })

  it('voice step: a fist hints to point instead, dictation passes', () => {
    const s = at('voice')
    expect(currentStep(s)?.id).toBe('voice')
    expect(stepTutorial(s, { type: 'grab' }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.VOICE_POINT, respawn: false })
    expect(stepTutorial(s, { type: 'throw' }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.VOICE_POINT, respawn: true })
    expect(stepTutorial(s, { type: 'dictated' }).reaction).toEqual({ kind: 'finish' })
  })

  it('dictation outside the voice step changes nothing', () => {
    expect(stepTutorial(initialTutorial(), { type: 'dictated' }).reaction).toEqual({ kind: 'none' })
  })

  it('voice step tells how to start dictation with the hand and the mouse', () => {
    const step = TUTORIAL_STEPS.find((s) => s.id === 'voice')
    expect(step?.instruction).toMatch(/пальцем/)
    expect(step?.note).toMatch(/Shift/)
  })

  it('skip moves on and resets mistakes; after the end events are ignored', () => {
    const s = run(initialTutorial(), { type: 'throw' }, { type: 'skip' })
    expect(s).toEqual({ index: 1, done: false, mistakes: 0 })
    const done = run(s, ...TUTORIAL_STEPS.slice(1).map((): TutorialEvent => ({ type: 'skip' })))
    expect(done.done).toBe(true)
    expect(stepTutorial(done, { type: 'skip' }).state).toBe(done)
  })

  it('progress label', () => {
    const n = TUTORIAL_STEPS.length
    expect(progressLabel(initialTutorial())).toBe(`Шаг 1 из ${n}`)
    expect(progressLabel({ index: n, done: true, mistakes: 0 })).toBe(`Шаг ${n} из ${n}`)
  })

  it('every hint message tells what to do and has an app code', () => {
    Object.values(TUTORIAL_HINTS).forEach((h) => {
      expect(h.code.startsWith('TUT_')).toBe(true)
      expect(h.message.length).toBeGreaterThan(10)
    })
  })
})
