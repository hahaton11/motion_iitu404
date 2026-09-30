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
   * Затяжной неуверенный ряд возвращает позу в бездействие, а не держит прежнюю.
   *
   * Какое-то время здесь было наоборот: неуверенный кадр не голосовал ни за кого, потому что
   * на записи тех дней это поднимало recall раскрытой ладони с 92.7 до 98.3 %. В той записи
   * не было класса `none`, и обратной стороны не было видно. На `data/gestures-v4.json`,
   * где он есть, `open` держит 98.6 % в обоих режимах, а вот ложные отпускания на покое
   * различаются вчетверо: 22.9 % против 8.7 %.
   *
   * Возврат в бездействие безопасен именно потому, что `POSE_SHAPE.idle` даёт closure 0.6 —
   * между порогами open 0.45 и hold 0.75. Держащая рука не роняет элемент, свободная его
   * не хватает: система перестаёт утверждать что-либо, вместо того чтобы угадывать.
   */
  it('returns to idle through a long run of unconfident frames', () => {
    const s = feed(['fist', 'fist', 'fist', 'fist', 'fist', 'fist'])
    const noisy = Array.from({ length: 6 }, (): [Pose, number] => ['open', 0.5])
    expect(feed(noisy, s).stable).toBe('idle')
  })

  it('still ignores a couple of unconfident frames inside a confident pose', () => {
    const s = feed(['fist', 'fist', 'fist', 'fist', 'fist', 'fist'])
    const blip = Array.from({ length: 2 }, (): [Pose, number] => ['open', 0.5])
    expect(feed(blip, s).stable).toBe('fist')
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
