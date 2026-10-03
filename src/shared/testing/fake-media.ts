import { vi } from 'vitest'

export interface FakeTrack {
  readonly kind: 'audio' | 'video'
  readonly stop: ReturnType<typeof vi.fn>
}

/** Поток getUserMedia без браузера: только то, что трогает код. */
export function fakeStream(kinds: readonly FakeTrack['kind'][]): { stream: MediaStream; tracks: FakeTrack[] } {
  const tracks: FakeTrack[] = kinds.map((kind) => ({ kind, stop: vi.fn() }))
  let live = [...tracks]
  const stream = {
    getTracks: () => [...live],
    getAudioTracks: () => live.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => live.filter((t) => t.kind === 'video'),
    removeTrack: (t: FakeTrack) => (live = live.filter((x) => x !== t)),
  } as unknown as MediaStream
  return { stream, tracks }
}
