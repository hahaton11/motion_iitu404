import type { GestureIcon } from './tutorial'

/** Название ошибки для финала, совет к ней и иконка жеста для тоста. Ключ — код подсказки. */
export interface HintInfo {
  readonly label: string
  readonly advice: string
  readonly icon: GestureIcon
}

const INFO: Readonly<Record<string, HintInfo>> = {
  HALF_GRAB: { label: 'Щипок не сомкнут до конца', advice: 'Своди кончики большого и указательного до касания', icon: 'fist' },
  HALF_RELEASE: { label: 'Щипок разжат не до конца', advice: 'Разводи большой и указательный широко, чтобы отпустить', icon: 'palm' },
  HAND_NEAR_EDGE: { label: 'Рука у края кадра', advice: 'Держи руку ближе к центру кадра, на уровне груди', icon: 'hand' },
  TOO_FAR: { label: 'Слишком далеко от камеры', advice: 'Встань на шаг ближе, чтобы ладонь была крупнее в кадре', icon: 'hand' },
  TOO_CLOSE: { label: 'Слишком близко к камере', advice: 'Отойди на шаг назад, чтобы рука целиком помещалась в кадр', icon: 'hand' },
  MOVING_TOO_FAST: { label: 'Рука двигалась слишком быстро', advice: 'Переноси элементы плавно, резкий мах оставь для броска', icon: 'hand' },
  POOR_TRACKING: { label: 'Камере не хватало света', advice: 'Повернись лицом к окну или лампе, свет должен падать на руку', icon: 'light' },
  NO_HAND: { label: 'Рука пропадала из кадра', advice: 'Держи руку перед камерой ладонью к экрану всё время игры', icon: 'hand' },
  BOARD_RELEASE_EDGE: { label: 'Отпускание за краем доски', advice: 'Отпускай элементы над доской, не доводя руку до края экрана', icon: 'palm' },
  BOARD_TOOLBAR_POINT: { label: 'Щипок на кнопке плашки', advice: 'Кнопки плашки выбираются жестом «V» с задержкой', icon: 'point' },
  BOARD_ZOOM_MAX: { label: 'Упор в максимальный зум', advice: 'Сводя руки, ты отдаляешь доску, разводя — приближаешь', icon: 'fist' },
  BOARD_ZOOM_MIN: { label: 'Упор в минимальный зум', advice: 'Сводя руки, ты отдаляешь доску, разводя — приближаешь', icon: 'fist' },
  POCKET_NEAR: { label: 'Элемент не донесён до кармана', advice: 'Опускай элемент до самой полосы кармана внизу экрана', icon: 'pocket' },
  POCKET_HOVER_SHORT: { label: 'Карман не успел открыться', advice: 'Держи курсор над карманом почти полсекунды', icon: 'pocket' },
  POCKET_STUCK: { label: 'Щипок не разжался над карманом', advice: 'Над карманом разводи большой и указательный полностью', icon: 'palm' },
  VOICE_UNSUPPORTED: { label: 'Голос недоступен в браузере', advice: 'Открой приложение в Chrome, чтобы диктовать стикеры', icon: 'voice' },
  VOICE_DENIED: { label: 'Нет доступа к микрофону', advice: 'Разреши микрофон в адресной строке браузера', icon: 'voice' },
  VOICE_NO_SPEECH: { label: 'Голос не расслышан', advice: 'Говори громче и сразу после появления плашки «Говори»', icon: 'voice' },
  VOICE_NETWORK: { label: 'Нет сети для распознавания', advice: 'Проверь интернет: Chrome распознаёт речь через сеть', icon: 'voice' },
  VOICE_AUDIO: { label: 'Микрофон не найден', advice: 'Подключи микрофон и выбери его в настройках браузера', icon: 'voice' },
  CH_NEAR_MISS: { label: 'Стикер на краю зоны', advice: 'Опускай стикер так, чтобы его центр был внутри рамки зоны', icon: 'palm' },
  CH_TIME_LOW: { label: 'Время почти вышло', advice: 'Сначала выброси лишнее, потом раскладывай по зонам', icon: 'hand' },
}

const ICON_BY_PREFIX: readonly (readonly [string, GestureIcon])[] = [
  ['TUT_THROW', 'throw'],
  ['TUT_PUT', 'pocket'],
  ['TUT_OPEN', 'pocket'],
  ['TUT_', 'fist'],
  ['VOICE_', 'voice'],
  ['POCKET_', 'pocket'],
]

export const NO_MISTAKES: HintInfo = {
  label: 'Ошибок не было',
  advice: 'Жесты чистые. Попробуй пройти быстрее и побить свой рекорд',
  icon: 'palm',
}

export function hintInfo(code: string, message = ''): HintInfo {
  const known = INFO[code]
  if (known) return known
  const icon = ICON_BY_PREFIX.find(([p]) => code.startsWith(p))?.[1] ?? 'hand'
  return { label: message || code, advice: message || NO_MISTAKES.advice, icon }
}

export const iconFor = (code: string): GestureIcon => hintInfo(code).icon
