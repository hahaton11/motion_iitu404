import type { GestureIcon } from './tutorial'

/** Название ошибки для финала, совет к ней и иконка жеста для тоста. Ключ — код подсказки. */
export interface HintInfo {
  readonly label: string
  readonly advice: string
  readonly icon: GestureIcon
}

const INFO: Readonly<Record<string, HintInfo>> = {
  HALF_GRAB: { label: 'Кулак сжат не до конца', advice: 'Сжимай кулак полностью, прижимая все пальцы к ладони', icon: 'fist' },
  HALF_RELEASE: { label: 'Ладонь раскрыта не до конца', advice: 'После кулака раскрывай ладонь широко, разводя пальцы', icon: 'palm' },
  CARRY_PUT_HOW: {
    label: 'Ждал, что элемент упадёт сам',
    advice: 'Взятый элемент прилипает к руке. Чтобы положить, сожми кулак и сразу раскрой ладонь',
    icon: 'fist',
  },
  CARRY_THROW_HOW: {
    label: 'Бросал махом без кулака',
    advice: 'Мах с элементом его не удаляет. Чтобы выбросить, на ходу сожми кулак и сразу раскрой ладонь',
    icon: 'throw',
  },
  CARRY_THROW_SLOW: {
    label: 'Кулак при броске держался долго',
    advice: 'Бросок — быстрый щелчок на ходу: кулак и сразу ладонь, меньше чем за полсекунды',
    icon: 'throw',
  },
  HALF_PINCH: { label: 'Щипок показан нечётко', advice: 'Для масштаба сомкни кончики большого и указательного, остальные пальцы согни', icon: 'zoom' },
  HALF_PAN: { label: 'Два пальца показаны нечётко', advice: 'Для панорамы выпрями указательный и средний, остальные прижми', icon: 'victory' },
  HAND_NEAR_EDGE: { label: 'Рука у края кадра', advice: 'Держи руку ближе к центру кадра, на уровне груди', icon: 'hand' },
  TOO_FAR: { label: 'Слишком далеко от камеры', advice: 'Встань на шаг ближе, чтобы ладонь была крупнее в кадре', icon: 'hand' },
  TOO_CLOSE: { label: 'Слишком близко к камере', advice: 'Отойди на шаг назад, чтобы рука целиком помещалась в кадр', icon: 'hand' },
  MOVING_TOO_FAST: { label: 'Рука двигалась слишком быстро', advice: 'Переноси элементы плавнее: на резком махе камера теряет руку', icon: 'hand' },
  POOR_TRACKING: { label: 'Камере не хватало света', advice: 'Повернись лицом к окну или лампе, свет должен падать на руку', icon: 'light' },
  NO_HAND: { label: 'Рука пропадала из кадра', advice: 'Держи руку перед камерой ладонью к экрану всё время игры', icon: 'hand' },
  BOARD_RELEASE_EDGE: { label: 'Элемент положен за краем доски', advice: 'Клади элементы над доской, не доводя руку до края экрана', icon: 'palm' },
  BOARD_TOOLBAR_POINT: { label: 'Кулак на кнопке плашки', advice: 'Кнопки плашки выбираются указательным пальцем с задержкой', icon: 'point' },
  BOARD_GRIP_PAN: { label: 'Доску тянули кулаком', advice: 'Доска двигается жестом двух пальцев: указательный и средний вытянуты', icon: 'victory' },
  BOARD_PINCH_GRAB: { label: 'Элемент брали щипком', advice: 'Элементы берутся кулаком. Щипок с ходом руки вверх или вниз меняет масштаб', icon: 'fist' },
  BOARD_ZOOM_MAX: { label: 'Упор в максимальный зум', advice: 'Щипок вниз или сведённые кулаки отдаляют доску, щипок вверх или разведённые — приближают', icon: 'zoom' },
  BOARD_ZOOM_MIN: { label: 'Упор в минимальный зум', advice: 'Щипок вниз или сведённые кулаки отдаляют доску, щипок вверх или разведённые — приближают', icon: 'zoom' },
  POCKET_NEAR: { label: 'Элемент не донесён до кармана', advice: 'Опускай элемент до самой полосы кармана и задержи, пока она не заполнится', icon: 'pocket' },
  POCKET_HOVER_SHORT: { label: 'Карман не успел открыться', advice: 'Держи открытую ладонь над карманом почти полсекунды', icon: 'pocket' },
  VOICE_UNSUPPORTED: { label: 'Голос недоступен в браузере', advice: 'Открой приложение в Chrome, чтобы диктовать стикеры', icon: 'voice' },
  VOICE_DENIED: { label: 'Нет доступа к микрофону', advice: 'Разреши микрофон в адресной строке браузера', icon: 'voice' },
  VOICE_NO_SPEECH: { label: 'Голос не расслышан', advice: 'Говори громче и сразу после появления плашки «Говори»', icon: 'voice' },
  VOICE_NETWORK: { label: 'Нет сети для распознавания', advice: 'Проверь интернет: Chrome распознаёт речь через сеть', icon: 'voice' },
  VOICE_AUDIO: { label: 'Микрофон не найден', advice: 'Подключи микрофон и выбери его в настройках браузера', icon: 'voice' },
  CH_NEAR_MISS: { label: 'Стикер на краю зоны', advice: 'Клади стикер так, чтобы его центр был внутри рамки зоны', icon: 'palm' },
  CH_TIME_LOW: { label: 'Время почти вышло', advice: 'Сначала выброси лишнее, потом раскладывай по зонам', icon: 'hand' },
}

const ICON_BY_PREFIX: readonly (readonly [string, GestureIcon])[] = [
  ['TUT_THROW', 'throw'],
  ['TUT_PUT', 'pocket'],
  ['TUT_OPEN', 'pocket'],
  ['TUT_VOICE', 'point'],
  ['TUT_', 'fist'],
  ['CARRY_', 'fist'],
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
