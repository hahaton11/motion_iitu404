import { describe, expect, it, vi } from 'vitest'
import { dropAudio, micAccessFromError, micSettled, requestMicrophone, type GetUserMedia } from './microphone'
import { fakeStream } from './testing/fake-media'

const fail = (name: string): GetUserMedia => () => Promise.reject(Object.assign(new Error(name), { name }))

describe('micAccessFromError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'missing'],
    ['NotReadableError', 'unavailable'],
    ['Whatever', 'unavailable'],
  ])('maps %s to %s', (name, access) => {
    expect(micAccessFromError({ name })).toBe(access)
  })

  it('handles non-object errors', () => {
    expect(micAccessFromError(undefined)).toBe('unavailable')
  })
})

describe('micSettled', () => {
  it('is false only while there is no answer yet', () => {
    expect(micSettled('unknown')).toBe(false)
    expect(micSettled('asking')).toBe(false)
    expect(micSettled('granted')).toBe(true)
    expect(micSettled('denied')).toBe(true)
  })
})

describe('dropAudio', () => {
  it('stops and removes audio tracks, keeps video', () => {
    const { stream, tracks } = fakeStream(['video', 'audio'])
    dropAudio(stream)
    expect(tracks[1]?.stop).toHaveBeenCalled()
    expect(tracks[0]?.stop).not.toHaveBeenCalled()
    expect(stream.getTracks().map((t) => t.kind)).toEqual(['video'])
  })
})

describe('requestMicrophone', () => {
  it('asks for audio only and stops the tracks at once', async () => {
    const { stream, tracks } = fakeStream(['audio'])
    const gum = vi.fn<GetUserMedia>().mockResolvedValue(stream)
    await expect(requestMicrophone(gum)).resolves.toBe('granted')
    expect(gum).toHaveBeenCalledWith({ audio: true, video: false })
    expect(tracks[0]?.stop).toHaveBeenCalled()
  })

  it('reports a refusal instead of throwing', async () => {
    await expect(requestMicrophone(fail('NotAllowedError'))).resolves.toBe('denied')
    await expect(requestMicrophone(fail('NotFoundError'))).resolves.toBe('missing')
  })

  it('is unavailable without getUserMedia', async () => {
    await expect(requestMicrophone(undefined)).resolves.toBe('unavailable')
  })
})
