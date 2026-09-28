/** Все пороги и тайминги модуля распознавания. Логика не содержит собственных чисел. */

// Индексы точек MediaPipe Hand Landmarker.
export const WRIST = 0
export const THUMB_TIP = 4
export const INDEX_TIP = 8
export const MIDDLE_MCP = 9
export const PALM_POINTS = [0, 5, 9, 13, 17] as const
export const LANDMARK_COUNT = 21

/** Цепочки суставов пальцев от основания к кончику. Первая точка цепочки у большого пальца CMC. */
export const FINGER_CHAINS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
} as const

/** Сумма углов сгибания трёх суставов пальца, при которой палец считается сжатым полностью, радианы. */
export const FULL_CURL_RAD = 3.9
/** Палец считается вытянутым, если его curl ниже этого значения. */
export const FINGER_EXTENDED_MAX = 0.3
/** Палец считается согнутым, если его curl выше этого значения. */
export const FINGER_CURLED_MIN = 0.5

/**
 * Щипок: расстояние между кончиками большого и указательного, отнесённое к длине ладони 0→9.
 * Ниже CLOSED — щипок полный, выше OPEN — пальцы разведены. Между ними сила щипка 0..1 линейно.
 */
export const PINCH_CLOSED_RATIO = 0.3
export const PINCH_OPEN_RATIO = 0.8

/** Соотношение ширины и высоты кадра камеры, чтобы размер ладони считался в долях высоты. */
export const FRAME_ASPECT = 16 / 9

// Экран и курсор.
/** Мёртвая зона по краям кадра, растягивается на весь экран. Используется для геометрии, не для курсора. */
export const EDGE_DEAD_ZONE = 0.08

/**
 * Воздушный трекпад: курсор двигается на смещение руки, пока вытянут указательный или идёт щипок.
 * Усиление растёт со скоростью: медленно — точно, быстро — далеко. Скорость в долях кадра в секунду.
 */
export const POINTER_GAIN_MIN = 1.4
export const POINTER_GAIN_MAX = 3.6
export const POINTER_GAIN_SPEED = 1.0
/** One Euro для свободной руки: быстрый отклик. Единицы — доли кадра. */
export const POINTER_FREE_FILTER = { minCutoff: 1.0, beta: 4, dCutoff: 1 } as const
/** One Euro при удержании элемента: сильнее гасит дрожь, элемент не дёргается. */
export const POINTER_HOLD_FILTER = { minCutoff: 0.5, beta: 3, dCutoff: 1 } as const
/** Поводок: курсор сдвигается, только когда цель ушла дальше радиуса. Доли экрана. */
export const POINTER_LEASH_FREE = 0.002
export const POINTER_LEASH_HOLD = 0.005
/** Максимум заморозки курсора, пока щипок смыкается или размыкается. */
export const POINTER_FREEZE_MAX_MS = 200

// One Euro filter для курсора. Единицы: доли экрана и герцы.
export const ONE_EURO_MIN_CUTOFF = 0.8
export const ONE_EURO_BETA = 5
export const ONE_EURO_D_CUTOFF = 1

// Машина состояний руки.
export const DEFAULT_HOLD_THRESHOLD = 0.75
export const DEFAULT_OPEN_THRESHOLD = 0.45
export const GRAB_FRAMES = 3
export const RELEASE_FRAMES = 3
/** Максимальное смещение курсора, при котором указательный жест считается неподвижным. */
export const POINT_MOVE_MAX = 0.03
/** Рука не видна дольше этого времени → handlost. */
export const HAND_LOST_MS = 300

// Zoom.
export const ZOOM_MIN_CHANGE = 0.005
/** Минимальное расстояние между руками, ниже которого zoom не считается, доли экрана. */
export const ZOOM_MIN_DISTANCE = 0.02
/** Сколько рука может провести вне захвата, пока сеанс zoom считается продолжающимся. */
export const ZOOM_END_GRACE_MS = 250

// Подсказки.
export const HINT_COOLDOWN_MS = 3000
export const HALF_GESTURE_MS = 500
export const EDGE_HINT_MARGIN = 0.05
/** Размер ладони: длина 0→9 в долях высоты кадра. */
export const PALM_SIZE_MIN = 0.07
export const PALM_SIZE_MAX = 0.32
/** Сколько геометрическое условие должно держаться до подсказки, чтобы не реагировать на один кадр. */
export const GEOMETRY_HINT_MS = 300
/** Скорость в момент потери руки, выше которой считаем, что камера не успела. Доли экрана в секунду. */
export const LOST_FAST_SPEED = 1.5
export const POOR_TRACKING_SCORE = 0.6
export const POOR_TRACKING_MS = 1000
export const NO_HAND_MS = 3000
/** Рука выше этой доли кадра закрывает человеку экран. */
export const HAND_TOO_HIGH_Y = 0.28
export const HAND_TOO_HIGH_MS = 1500
/** Рука двигается без сцепа: вероятно, человек хочет вести курсор, но не вытянул палец. */
export const NOT_POINTING_SPEED = 0.35
export const NOT_POINTING_MS = 900

// Калибровка.
export const CALIBRATION_STEP_MS = 2500
/** Первые миллисекунды каждого шага пропускаются, пока человек меняет позу. */
export const CALIBRATION_SETTLE_MS = 600
export const CALIBRATION_MIN_SAMPLES = 10
/** Минимальная разница closure между кулаком и ладонью, иначе калибровка не удалась. */
export const CALIBRATION_MIN_RANGE = 0.25
/** Доли диапазона ладонь → кулак, в которых ставятся пороги. Совпадают с порогами по умолчанию. */
export const CALIBRATION_HOLD_RATIO = 0.75
export const CALIBRATION_OPEN_RATIO = 0.45

// Трекер.
export const CAMERA_WIDTH = 1280
export const CAMERA_HEIGHT = 720
export const NUM_HANDS = 2
export const MIN_DETECTION_CONFIDENCE = 0.5
export const MIN_PRESENCE_CONFIDENCE = 0.5
export const MIN_TRACKING_CONFIDENCE = 0.5
export const MODEL_PATH = 'models/hand_landmarker.task'
export const WASM_PATH = 'mediapipe/wasm'
/**
 * MediaPipe определяет handedness так, будто кадр зеркальный. Мы подаём незеркальный кадр
 * фронтальной камеры, поэтому метки меняются местами.
 */
export const SWAP_HANDEDNESS = true
