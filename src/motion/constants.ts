/** Все пороги и тайминги модуля распознавания. Логика не содержит собственных чисел. */

// Индексы точек MediaPipe Hand Landmarker.
export const WRIST = 0
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

/** Соотношение ширины и высоты кадра камеры, чтобы размер ладони считался в долях высоты. */
export const FRAME_ASPECT = 16 / 9

// Экран и курсор.
/** Мёртвая зона по краям кадра, растягивается на весь экран. Используется для геометрии, не для курсора. */
export const EDGE_DEAD_ZONE = 0.08

/**
 * Рабочая зона курсора в кадре: центр и размер в долях кадра.
 * Вся зона растягивается на экран, поэтому до углов экрана хватает движения кистью от локтя.
 */
export const POINTER_BOX = { cx: 0.5, cy: 0.5, w: 0.5, h: 0.5 } as const
/** One Euro для свободной руки: быстрый отклик. */
export const POINTER_FREE_FILTER = { minCutoff: 1.0, beta: 4, dCutoff: 1 } as const
/** One Euro при удержании элемента: сильнее гасит дрожь, элемент не дёргается. */
export const POINTER_HOLD_FILTER = { minCutoff: 0.35, beta: 2, dCutoff: 1 } as const
/** Поводок: курсор сдвигается, только когда рука ушла дальше радиуса. Доли экрана. */
export const POINTER_LEASH_FREE = 0.003
export const POINTER_LEASH_HOLD = 0.008
/** Максимум заморозки курсора, пока кулак сжимается или разжимается. */
export const POINTER_FREEZE_MAX_MS = 250
/** Насколько быстро гасится смещение после заморозки: доля смещения на единицу пути руки. */
export const POINTER_OFFSET_BLEED = 4

// One Euro filter для курсора. Единицы: доли экрана и герцы.
export const ONE_EURO_MIN_CUTOFF = 0.8
export const ONE_EURO_BETA = 5
export const ONE_EURO_D_CUTOFF = 1

// Машина состояний руки.
export const DEFAULT_HOLD_THRESHOLD = 0.75
export const DEFAULT_OPEN_THRESHOLD = 0.45
export const GRAB_FRAMES = 3
export const RELEASE_FRAMES = 3
/** Кадров подтверждения отпускания, когда рука уже летит быстрее THROW_SPEED. */
export const FAST_RELEASE_FRAMES = 1
/** Максимальное смещение курсора, при котором указательный жест считается неподвижным. */
export const POINT_MOVE_MAX = 0.03
/** Рука не видна дольше этого времени → handlost. */
export const HAND_LOST_MS = 300

// Взмахи. Скорости в долях экрана в секунду, путь в долях экрана.
/** Скорость, с которой начинается взмах, и ниже которой он заканчивается. */
export const SWIPE_START_SPEED = 1.1
export const SWIPE_END_SPEED = 0.45
/** Минимальный путь взмаха. Короче, но длиннее SWIPE_HINT_MIN — подсказка «махни шире». */
export const SWIPE_MIN_DIST = 0.14
export const SWIPE_HINT_MIN = 0.06
/** Главная ось должна быть во столько раз длиннее второй, иначе взмах диагональный. */
export const SWIPE_AXIS_RATIO = 1.6
/** Взмах длиннее по времени не считается: это уже перенос руки. */
export const SWIPE_MAX_MS = 450
/** После взмаха рука возвращается назад: обратное направление игнорируется это время. */
export const SWIPE_RETURN_MS = 650
/** Любой следующий взмах не раньше. */
export const SWIPE_COOLDOWN_MS = 220

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
/**
 * Размер кадра — главная статья расходов распознавания, а не камеры. Замер на машине показа:
 * при 1280×720 один вызов детектора занимал 62 мс, что запирает цикл на 16 кадрах в секунду
 * (наблюдалось 15), и две руки стоили ровно столько же, сколько одна. Значит платили не за руки,
 * а за заливку текстуры 1280×720 на каждый кадр — при том что модели внутри ужимают вход
 * примерно до 200×200 и всё лишнее выбрасывают.
 *
 * 640×360 — вчетверо меньше пикселей при том же соотношении сторон. Ниже опускать нельзя без
 * проверки: на кисть остаётся слишком мало пикселей, и точки плывут на рабочем расстоянии.
 */
export const CAMERA_WIDTH = 640
export const CAMERA_HEIGHT = 360
/**
 * Чем выше частота съёмки, тем короче выдержка кадра и тем меньше смаз на резком движении.
 * Точки кисти заметно теряются в качестве на съёмке ниже 60 кадров, а бросок целиком состоит
 * из таких кадров. Пожелание, а не требование: камера без 60 кадров отдаст, сколько умеет.
 * На меньшем кадре шансы получить 60 заметно выше: веб-камеры чаще умеют их не на 720p.
 */
export const CAMERA_FPS = 60
export const NUM_HANDS = 2
export const MIN_DETECTION_CONFIDENCE = 0.5
export const MIN_PRESENCE_CONFIDENCE = 0.5
export const MIN_TRACKING_CONFIDENCE = 0.5
export const MODEL_PATH = 'models/hand_landmarker.task'
/** Классификатор позы, обученный на датасете: scripts/build-gesture-model.ts. */
export const GESTURE_MODEL_PATH = 'models/gestures-knn.json'
export const WASM_PATH = 'mediapipe/wasm'
/**
 * Менять ли местами метки handedness MediaPipe. Проверено на живой записи: правая рука приходит
 * с меткой Right при незеркальном кадре фронтальной камеры, поэтому менять не нужно.
 */
export const SWAP_HANDEDNESS = false
