/** Раскладка веера и выбор карточки под прицелом. Всё в пикселях экрана. */

export interface Viewport {
  readonly w: number
  readonly h: number
}

/** Карточка веера: центр, размер и поворот в градусах. */
export interface FanSlot {
  readonly cx: number
  readonly cy: number
  readonly size: number
  readonly rotation: number
}

/** Высота полосы кармана в долях экрана. */
export const POCKET_HEIGHT = 0.12
/** Размер карточки: доля высоты экрана с пределами в пикселях. */
export const CARD_FRACTION = 0.15
export const CARD_MIN_PX = 84
export const CARD_MAX_PX = 132
/** Шаг между карточками относительно их размера и доля ширины экрана под весь веер. */
export const CARD_SPACING = 1.08
export const FAN_WIDTH_FRACTION = 0.88
/** Насколько карточки выступают над карманом и как сильно выгнута дуга. */
export const FAN_RAISE = 0.62
export const FAN_ARC = 0.32
export const FAN_MAX_ROT_DEG = 9
/** Запас попадания по карточке: прицел руки дрожит. */
export const FAN_HIT_PAD_PX = 10
/** Запас над верхом веера, в пределах которого веер не закрывается. */
export const FAN_REGION_PAD_PX = 48

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

export const cardSize = (vp: Viewport): number => clamp(vp.h * CARD_FRACTION, CARD_MIN_PX, CARD_MAX_PX)

/** Верхний край кармана в пикселях. */
export const pocketTopPx = (vp: Viewport): number => vp.h * (1 - POCKET_HEIGHT)

/** Карточки дугой над карманом: середина выше краёв, края повёрнуты наружу. */
export function fanLayout(count: number, vp: Viewport): readonly FanSlot[] {
  if (count <= 0) return []
  const size = cardSize(vp)
  const half = (count - 1) / 2
  const fit = half > 0 ? (vp.w * FAN_WIDTH_FRACTION - size) / (2 * half) : 0
  const step = Math.min(size * CARD_SPACING, Math.max(fit, size * 0.5))
  const base = pocketTopPx(vp) - size * FAN_RAISE
  return Array.from({ length: count }, (_, i) => {
    const t = half > 0 ? (i - half) / half : 0
    return {
      cx: vp.w / 2 + (i - half) * step,
      cy: base - size * FAN_ARC * (1 - t * t),
      size,
      rotation: t * FAN_MAX_ROT_DEG,
    }
  })
}

/** Верх области веера в долях экрана: выше него рука считается ушедшей. */
export function fanRegionTop(slots: readonly FanSlot[], vp: Viewport): number {
  if (slots.length === 0) return 1 - POCKET_HEIGHT
  const top = Math.min(...slots.map((s) => s.cy - s.size / 2))
  return Math.max(0, (top - FAN_REGION_PAD_PX) / vp.h)
}

/** Индекс карточки под точкой. Среди перекрытых — ближайшая по центру. */
export function fanHit(slots: readonly FanSlot[], x: number, y: number): number | undefined {
  let best: number | undefined
  let bestDist = Infinity
  slots.forEach((s, i) => {
    const half = s.size / 2 + FAN_HIT_PAD_PX
    if (Math.abs(x - s.cx) > half || Math.abs(y - s.cy) > half) return
    const d = Math.hypot(x - s.cx, y - s.cy)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  })
  return best
}
