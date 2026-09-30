import type { Pose, RawPose } from './model'

/**
 * Сглаживание позы по кадрам. Поза становится устойчивой, если победила в need кадрах из последних
 * window с уверенностью не ниже threshold. Если ни одна поза не набрала голосов, остаётся прежняя:
 * один смазанный кадр не роняет элемент и не нажимает кнопку.
 *
 * Что делает кадр ниже порога — см. `BelowThreshold`. Это не мелочь настройки: от этого зависит,
 * успевает ли система за быстрым движением. Низкая уверенность — отсутствие показаний,
 * а не показание в пользу покоя.
 */

export const VOTE_WINDOW = 6
export const VOTE_NEED = 4
export const VOTE_THRESHOLD = 0.75

/**
 * - `idle` — голосует за бездействие. На быстром движении и на развёрнутой ладони уверенность
 *   падает, такие кадры набирают idle большинством, и поза замирает в покое ровно тогда,
 *   когда рука действует. Так бросок и не собирался.
 * - `skip` — занимает место в окне, но не голосует ни за кого. Окно по-прежнему движется во
 *   времени, порог «4 из 6» остаётся, но неуверенные кадры больше не работают против позы.
 * - `abstain` — не попадает в окно вовсе. Окно перестаёт быть временным и растягивается на
 *   сколько угодно кадров назад; уверенная ошибка живёт дольше, чем должна.
 */
export type BelowThreshold = 'idle' | 'skip' | 'abstain'

export interface VoterParams {
  readonly window: number
  readonly need: number
  readonly threshold: number
  readonly belowThreshold: BelowThreshold
}

/**
 * `idle` выбран по замеру на `data/gestures-v4.json`, отложенный круг:
 *
 *   режим   точность   ложные действия на бездействии   open    pinch   point
 *   skip     92.7 %              22.9 %                 98.6 %  98.6 %  98.0 %
 *   idle     94.7 %               8.7 %                 98.6 %  92.0 %  90.8 %
 *
 * Раньше здесь стоял `skip`, и не зря: на записи, снятой до этого, неуверенные кадры голосовали
 * за покой и роняли распознавание раскрытой ладони с 98.3 до 92.7 %. Но в той записи не было
 * класса `none` — ни одного кадра руки, которая просто двигается не жестикулируя, — и обратную
 * сторону размена нечем было увидеть.
 *
 * Теперь она видна. `open` держит 98.6 % в обоих режимах: то, ради чего вводился `skip`,
 * починила перезапись датасета на машине показа, а не голосователь. Зато `skip` пропускает
 * неуверенный кадр покоя дальше в действие, и каждое пятое такое отпускание ложное — элемент
 * выпадает из руки, когда её опускают отдохнуть.
 *
 * Цена возврата — recall щипка и указательного: захват иногда приходится повторить. Это дешевле
 * отпускания, которого не просили: лишний захват виден и исправляется, потерянный элемент — нет.
 */
export const DEFAULT_VOTER: VoterParams = {
  window: VOTE_WINDOW,
  need: VOTE_NEED,
  threshold: VOTE_THRESHOLD,
  belowThreshold: 'idle',
}

export interface VoterState {
  /** Кадр без голоса хранится как undefined: место в окне занимает, за класс не голосует. */
  readonly history: readonly (Pose | undefined)[]
  readonly stable: Pose
}

export const initialVoter = (): VoterState => ({ history: [], stable: 'idle' })

export function stepVoter(s: VoterState, raw: RawPose, p: VoterParams = DEFAULT_VOTER): VoterState {
  const confident = raw.confidence >= p.threshold
  if (!confident && p.belowThreshold === 'abstain') return s
  const vote: Pose | undefined = confident ? raw.label : p.belowThreshold === 'idle' ? 'idle' : undefined
  const history = [...s.history, vote].slice(-p.window)
  const counts = new Map<Pose, number>()
  history.forEach((x) => {
    if (x !== undefined) counts.set(x, (counts.get(x) ?? 0) + 1)
  })
  let stable = s.stable
  let best = p.need - 1
  counts.forEach((n, x) => {
    if (n > best) {
      best = n
      stable = x
    }
  })
  return { history, stable }
}
