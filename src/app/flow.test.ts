import { describe, expect, it } from 'vitest'
import { initialFlow, isBoardScreen, modeFromQuery, nextFlow, type FlowEvent, type FlowState } from './flow'

const run = (s: FlowState, ...events: FlowEvent[]): FlowState => events.reduce(nextFlow, s)

describe('flow', () => {
  it('camera path: start → camera → calibration → tutorial → challenge → final', () => {
    const events: FlowEvent[] = [
      { type: 'start' },
      { type: 'cameraReady' },
      { type: 'calibrated' },
      { type: 'tutorialDone' },
      { type: 'challengeDone' },
    ]
    const screens: string[] = []
    events.reduce((s, e) => {
      const next = nextFlow(s, e)
      screens.push(next.screen)
      return next
    }, initialFlow('camera'))
    expect(screens).toEqual(['camera', 'calibration', 'tutorial', 'challenge', 'final'])
  })

  it('mouse mode skips camera and calibration', () => {
    expect(nextFlow(initialFlow('mouse'), { type: 'start' }).screen).toBe('tutorial')
  })

  it('camera refusal switches to mouse and goes to tutorial', () => {
    const s = run(initialFlow('camera'), { type: 'start' }, { type: 'useMouse' })
    expect(s).toEqual({ screen: 'tutorial', mode: 'mouse', tutorialDone: false })
  })

  it('skipping calibration still leads to tutorial', () => {
    const s = run(initialFlow('camera'), { type: 'start' }, { type: 'cameraReady' }, { type: 'skipCalibration' })
    expect(s.screen).toBe('tutorial')
  })

  it('again goes straight to challenge, free goes to free board', () => {
    const final = run(initialFlow('mouse'), { type: 'start' }, { type: 'tutorialDone' }, { type: 'challengeDone' })
    expect(nextFlow(final, { type: 'again' }).screen).toBe('challenge')
    expect(nextFlow(final, { type: 'free' }).screen).toBe('free')
  })

  it('after the tutorial once, a new start from home skips it', () => {
    const s = run(initialFlow('mouse'), { type: 'start' }, { type: 'tutorialDone' }, { type: 'home' }, { type: 'start' })
    expect(s.screen).toBe('challenge')
  })

  it('ignores events not allowed on the current screen', () => {
    const s = initialFlow('camera')
    expect(nextFlow(s, { type: 'challengeDone' })).toBe(s)
    expect(nextFlow(s, { type: 'home' })).toBe(s)
    const tut = run(initialFlow('mouse'), { type: 'start' })
    expect(nextFlow(tut, { type: 'setMode', mode: 'camera' })).toBe(tut)
  })

  it('setMode on start changes mode without leaving start', () => {
    const s = nextFlow(initialFlow('camera'), { type: 'setMode', mode: 'mouse' })
    expect(s).toEqual({ screen: 'start', mode: 'mouse', tutorialDone: false })
    expect(nextFlow(s, { type: 'setMode', mode: 'mouse' })).toBe(s)
  })

  it('does not mutate the previous state', () => {
    const s = initialFlow('camera')
    nextFlow(s, { type: 'start' })
    expect(s.screen).toBe('start')
  })

  it('board screens and query mode', () => {
    expect(isBoardScreen('challenge')).toBe(true)
    expect(isBoardScreen('final')).toBe(false)
    expect(modeFromQuery('?input=mouse')).toBe('mouse')
    expect(modeFromQuery('?input=camera')).toBe('camera')
    expect(modeFromQuery('')).toBe('camera')
  })
})
