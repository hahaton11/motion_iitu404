import { describe, expect, it } from 'vitest'
import { CAMERA_ERROR_TEXTS, CameraError, cameraErrorCode } from './camera'

describe('cameraErrorCode', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'not-found'],
    ['OverconstrainedError', 'not-found'],
    ['NotReadableError', 'busy'],
    ['Whatever', 'unknown'],
  ])('maps %s to %s', (name, code) => {
    expect(cameraErrorCode({ name })).toBe(code)
  })

  it('handles non-object errors', () => {
    expect(cameraErrorCode('boom')).toBe('unknown')
    expect(cameraErrorCode(undefined)).toBe('unknown')
  })

  it('keeps the code of a CameraError', () => {
    expect(cameraErrorCode(new CameraError('insecure'))).toBe('insecure')
  })
})

describe('CameraError', () => {
  it('carries an actionable Russian message', () => {
    const e = new CameraError('denied')
    expect(e.message).toBe(CAMERA_ERROR_TEXTS.denied)
    expect(e.message).toMatch(/Разреши/)
  })
})
