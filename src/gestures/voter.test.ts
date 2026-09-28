import { describe, expect, it } from 'vitest'
import type { Pose } from './model'
import { initialVoter, stepVoter, type VoterState } from './voter'

const feed = (poses: readonly (Pose | [Pose, number])[], from: VoterState = initialVoter()): VoterState =>
  poses.reduce((s, p) => stepVoter(s, Array.isArray(p) ? { label: p[0], confidence: p[1] } : { label: p, confidence: 1 }), from)

describe('stepVoter', () => {
  it('becomes stable after 4 of 6 frames', () => {
    expect(feed(['fist', 'fist', 'fist']).stable).toBe('idle')
    expect(feed(['fist', 'fist', 'fist', 'fist']).stable).toBe('fist')
  })

  it('ignores a single noisy frame', () => {
    const s = feed(['fist', 'fist', 'fist', 'fist', 'fist', 'fist'])
    expect(feed(['open', 'fist'], s).stable).toBe('fist')
  })

  it('keeps the previous pose when nothing has a majority', () => {
    const s = feed(['fist', 'fist', 'fist', 'fist', 'fist', 'fist'])
    expect(feed(['open', 'idle', 'point', 'open', 'idle', 'point'], s).stable).toBe('fist')
  })

  /*
   * Неуверенный кадр — это отсутствие показаний, а не показание в пользу покоя.
   * Раньше он голосовал за idle, и поза замирала в бездействии ровно на быстром движении
   * и на развёрнутой ладони, где уверенность падает: бросок из-за этого не собирался.
   */
  it('does not let low confidence frames overturn an established pose', () => {
    const s = feed(['fist', 'fist', 'fist', 'fist', 'fist', 'fist'])
    const noisy = Array.from({ length: 6 }, (): [Pose, number] => ['open', 0.5])
    expect(feed(noisy, s).stable).toBe('fist')
  })

  it('leaves the initial pose alone when every frame is unconfident', () => {
    expect(feed(Array.from({ length: 6 }, (): [Pose, number] => ['fist', 0.5])).stable).toBe('idle')
  })

  /*
   * Кадр без голоса всё же занимает место в окне, поэтому «4 из 6» остаётся окном по времени.
   * Иначе четыре уверенных кадра, разбросанных по двум секундам, складывались бы в позу.
   */
  it('ages confident frames out through a long unconfident run', () => {
    const noisy = Array.from({ length: 10 }, (): [Pose, number] => ['idle', 0.5])
    expect(feed(['fist', 'fist', 'fist', ...noisy, 'fist']).stable).toBe('idle')
  })
})
