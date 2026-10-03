import { describe, expect, it } from 'vitest'
import { cameraLine, DICTATE_TIP, MIC_ADVICE, micAdvice, micLine, VOICE_OFF_TIP, voiceTip } from './permissions'

describe('cameraLine', () => {
  it.each([
    ['ready', 'Камера ✓', 'ok'],
    ['loading', 'Камера …', 'wait'],
    ['off', 'Камера …', 'wait'],
    ['failed', 'Камера ✗', 'off'],
  ] as const)('%s → %s', (phase, label, mark) => {
    expect(cameraLine(phase)).toEqual({ label, mark })
  })
})

describe('micLine', () => {
  it('waits while there is no answer', () => {
    expect(micLine('unknown', true).mark).toBe('wait')
    expect(micLine('asking', true).label).toBe('Микрофон …')
  })

  it('is ok only with permission and speech recognition', () => {
    expect(micLine('granted', true)).toEqual({ label: 'Микрофон ✓', mark: 'ok' })
    expect(micLine('granted', false).mark).toBe('off')
  })

  it.each(['denied', 'missing', 'unavailable'] as const)('is off when %s', (mic) => {
    expect(micLine(mic, true)).toEqual({ label: 'Микрофон ✗', mark: 'off' })
  })
})

describe('micAdvice', () => {
  it('says where to allow the microphone after a refusal', () => {
    expect(micAdvice('denied', true)).toBe(MIC_ADVICE.denied)
    expect(MIC_ADVICE.denied).toMatch(/адресной строке/)
    expect(MIC_ADVICE.denied).toMatch(/остальное работает/)
  })

  it('asks to plug in a missing microphone', () => {
    expect(micAdvice('missing', true)).toBe(MIC_ADVICE.missing)
  })

  it('points to Chrome when speech recognition is missing', () => {
    expect(micAdvice('granted', false)).toBe(MIC_ADVICE.noSpeech)
  })

  it('is silent when all is fine or still waiting', () => {
    expect(micAdvice('granted', true)).toBeUndefined()
    expect(micAdvice('asking', true)).toBeUndefined()
    expect(micAdvice('unknown', false)).toBeUndefined()
  })
})

describe('voiceTip', () => {
  it('names the dictation gesture of the input mode', () => {
    expect(voiceTip('granted', 'camera', true)).toBe(DICTATE_TIP.camera)
    expect(voiceTip('granted', 'mouse', true)).toBe(DICTATE_TIP.mouse)
    expect(voiceTip('unknown', 'camera', true)).toBe(DICTATE_TIP.camera)
  })

  it('tells what to enable when voice is off', () => {
    expect(voiceTip('denied', 'camera', true)).toBe(VOICE_OFF_TIP.denied)
    expect(voiceTip('missing', 'mouse', true)).toBe(VOICE_OFF_TIP.missing)
    expect(voiceTip('granted', 'camera', false)).toBe(VOICE_OFF_TIP.noSpeech)
  })
})
