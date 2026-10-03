import { describe, expect, it, vi } from 'vitest'
import type { GetUserMedia } from '../shared/microphone'
import { fakeStream } from '../shared/testing/fake-media'
import { acquireCamera, CAMERA_ERROR_TEXTS, CameraError, cameraErrorCode } from './camera'

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

describe('acquireCamera', () => {
  const VIDEO: MediaStreamConstraints = { audio: false, video: { facingMode: 'user' } }
  const refuse = (name: string) => Promise.reject(Object.assign(new Error(name), { name }))

  it('asks camera and microphone in one request and drops the audio', async () => {
    const { stream, tracks } = fakeStream(['video', 'audio'])
    const gum = vi.fn<GetUserMedia>().mockResolvedValue(stream)
    const got = await acquireCamera(gum, VIDEO, true)
    expect(gum).toHaveBeenCalledTimes(1)
    expect(gum).toHaveBeenCalledWith({ ...VIDEO, audio: true })
    expect(got.mic).toBe('granted')
    expect(tracks[1]?.stop).toHaveBeenCalled()
    expect(got.stream.getTracks().map((t) => t.kind)).toEqual(['video'])
  })

  it('falls back to the camera alone when the microphone is refused', async () => {
    const { stream } = fakeStream(['video'])
    const gum = vi.fn<GetUserMedia>((c) => (c.audio ? refuse('NotAllowedError') : Promise.resolve(stream)))
    const got = await acquireCamera(gum, VIDEO, true)
    expect(gum).toHaveBeenCalledTimes(2)
    expect(gum).toHaveBeenLastCalledWith(VIDEO)
    expect(got).toEqual({ stream, mic: 'denied' })
  })

  it('reports a missing microphone when only the camera exists', async () => {
    const { stream } = fakeStream(['video'])
    const gum = vi.fn<GetUserMedia>((c) => (c.audio ? refuse('NotFoundError') : Promise.resolve(stream)))
    expect((await acquireCamera(gum, VIDEO, true)).mic).toBe('missing')
  })

  it('throws the camera error when the camera alone is refused too', async () => {
    const gum = vi.fn<GetUserMedia>(() => refuse('NotAllowedError'))
    await expect(acquireCamera(gum, VIDEO, true)).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(cameraErrorCode(await acquireCamera(gum, VIDEO, true).catch((e: unknown) => e))).toBe('denied')
  })

  it('does not touch the microphone without withMic', async () => {
    const { stream } = fakeStream(['video'])
    const gum = vi.fn<GetUserMedia>().mockResolvedValue(stream)
    const got = await acquireCamera(gum, VIDEO, false)
    expect(gum).toHaveBeenCalledWith(VIDEO)
    expect(got.mic).toBeUndefined()
  })
})
