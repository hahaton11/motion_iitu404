import { describe, expect, it } from 'vitest'
import {
  currentStep,
  initialTutorial,
  progressLabel,
  stepTutorial,
  TUTORIAL_HINTS,
  TUTORIAL_STEPS,
  type TutorialEvent,
  type TutorialState,
} from './tutorial'

const run = (s: TutorialState, ...events: TutorialEvent[]): TutorialState =>
  events.reduce((acc, e) => stepTutorial(acc, e).state, s)

describe('tutorial', () => {
  it('has four steps in the order of the spec', () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual(['move', 'throw', 'take', 'put'])
  })

  it('passes all steps with the right actions and finishes', () => {
    const s = run(initialTutorial(), { type: 'drop', inFrame: true }, { type: 'throw' }, { type: 'take' })
    expect(currentStep(s)?.id).toBe('put')
    const last = stepTutorial(s, { type: 'put' })
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
    const s = run(initialTutorial(), { type: 'skip' })
    expect(stepTutorial(s, { type: 'drop', inFrame: false }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.THROW_FASTER })
    expect(stepTutorial(s, { type: 'put' }).reaction).toMatchObject({ respawn: true })
  })

  it('take step: grabbing a board element suggests opening the pocket', () => {
    const s = run(initialTutorial(), { type: 'skip' }, { type: 'skip' })
    expect(stepTutorial(s, { type: 'grab' }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.OPEN_POCKET })
    expect(stepTutorial(s, { type: 'drop', inFrame: false }).reaction).toEqual({ kind: 'none' })
  })

  it('put step: throw and board drop give different hints', () => {
    const s = run(initialTutorial(), { type: 'skip' }, { type: 'skip' }, { type: 'skip' })
    expect(stepTutorial(s, { type: 'throw' }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.PUT_NO_THROW, respawn: true })
    expect(stepTutorial(s, { type: 'drop', inFrame: false }).reaction).toMatchObject({ hint: TUTORIAL_HINTS.PUT_LOWER })
  })

  it('skip moves on and resets mistakes; after the end events are ignored', () => {
    const s = run(initialTutorial(), { type: 'throw' }, { type: 'skip' })
    expect(s).toEqual({ index: 1, done: false, mistakes: 0 })
    const done = run(s, { type: 'skip' }, { type: 'skip' }, { type: 'skip' })
    expect(done.done).toBe(true)
    expect(stepTutorial(done, { type: 'skip' }).state).toBe(done)
  })

  it('progress label', () => {
    expect(progressLabel(initialTutorial())).toBe('Шаг 1 из 4')
    expect(progressLabel({ index: 4, done: true, mistakes: 0 })).toBe('Шаг 4 из 4')
  })

  it('every hint message tells what to do and has an app code', () => {
    Object.values(TUTORIAL_HINTS).forEach((h) => {
      expect(h.code.startsWith('TUT_')).toBe(true)
      expect(h.message.length).toBeGreaterThan(10)
    })
  })
})
