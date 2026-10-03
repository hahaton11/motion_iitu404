import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Жесты MouseInput для смоук-тестов. Эмулятор считает скорость по отметкам времени событий,
 * поэтому плавный перенос идёт мелкими шагами с паузами, а бросок — крупными и быстрыми.
 */

export interface Point {
  readonly x: number
  readonly y: number
}

const SLOW_STEP_PX = 14
const SLOW_STEP_MS = 16
const SETTLE_MS = 160
/**
 * Бросок: мало крупных шагов вместо многих мелких. Каждый page.mouse.move — обращение
 * к браузеру, и его собственная задержка соизмерима с паузой между шагами, поэтому
 * скорость задаётся расстоянием, а не темпом. Замеры при пороге THROW_SPEED 2.2:
 * шесть шагов по 8 мс на 420 px дают 2,31, три шага по 16 мс на 360 px — 2,02.
 *
 * Обе цифры на грани, и на загруженной машине тест снова начал падать: собственная задержка
 * обращения к браузеру растёт, а размах остаётся прежним. Своя пауза убрана совсем, шагов два —
 * тогда всё время движения это round-trip, и быстрее эмулятор сделать нельзя. Размах по-прежнему
 * во всю ширину экрана.
 */
const THROW_STEPS = 2
const THROW_STEP_MS = 0
/** Отступ от края: дальше курсор не уедет, браузер прижмёт его к окну и размах срежется. */
const THROW_EDGE_PX = 40
/** Меньший размах не разгоняет курсор до порога броска ни при каком темпе. */
const THROW_MIN_PX = 420
const POCKET_HOVER_MS = 700
const FAN_SETTLE_MS = 600

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function centerOf(target: Locator): Promise<Point> {
  const box = await target.boundingBox()
  if (!box) throw new Error('element is not visible')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Плавное движение без броска: скорость заметно ниже порога THROW_SPEED. */
export async function glide(page: Page, from: Point, to: Point): Promise<void> {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / SLOW_STEP_PX))
  for (let i = 1; i <= steps; i++) {
    const k = i / steps
    await page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k)
    await wait(SLOW_STEP_MS)
  }
}

/** Взять кулаком, перенести плавно и раскрыть ладонь. */
export async function drag(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await glide(page, from, to)
  await wait(SETTLE_MS)
  await page.mouse.up()
}

/**
 * Взять и резко махнуть в сторону, отпуская на ходу. Сторона выбирается сама — та, где
 * до края больше места: бросок удаляет элемент независимо от направления.
 */
export async function fling(page: Page, from: Point): Promise<void> {
  const vp = page.viewportSize()
  if (!vp) throw new Error('no viewport')
  const toRight = vp.width - THROW_EDGE_PX - from.x
  const toLeft = THROW_EDGE_PX - from.x
  const dx = toRight >= -toLeft ? toRight : toLeft
  if (Math.abs(dx) < THROW_MIN_PX) throw new Error(`no room to fling from x=${Math.round(from.x)}`)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await wait(SETTLE_MS)
  for (let i = 1; i <= THROW_STEPS; i++) {
    await page.mouse.move(from.x + (dx * i) / THROW_STEPS, from.y)
    await wait(THROW_STEP_MS)
  }
  await page.mouse.up()
}

/** Задержать открытую ладонь над карманом, пока веер не раскроется. */
export async function openPocket(page: Page): Promise<void> {
  const vp = page.viewportSize()
  if (!vp) throw new Error('no viewport')
  const spot = { x: vp.width / 2, y: vp.height * 0.95 }
  await page.mouse.move(spot.x, spot.y)
  const until = Date.now() + POCKET_HOVER_MS
  let nudge = 1
  while (Date.now() < until) {
    nudge = -nudge
    await page.mouse.move(spot.x + nudge, spot.y)
    await wait(SLOW_STEP_MS * 4)
  }
  await expect(page.locator('.pk-front.is-open')).toBeVisible()
  await wait(FAN_SETTLE_MS)
}

/** Открыть карман и сжать кулак над карточкой: элемент остаётся в руке. */
export async function takeFromPocket(page: Page, index = 0): Promise<Point> {
  await openPocket(page)
  const card = page.locator('.pk-fan .pk-card.is-shown').nth(index)
  const at = await centerOf(card)
  const vp = page.viewportSize()
  await glide(page, { x: (vp?.width ?? 0) / 2, y: (vp?.height ?? 0) * 0.95 }, at)
  await wait(SETTLE_MS)
  await page.mouse.down()
  return at
}

/** Удержание Shift с кнопкой дольше POINT_HOLD_MS эмулятора: жест «указать пальцем». */
const POINT_HOLD_WAIT_MS = 900

/** Указать пальцем и задержать: выбирает стикер и начинает диктовку. */
export async function pointAt(page: Page, at: Point): Promise<void> {
  await page.mouse.move(at.x, at.y)
  await page.keyboard.down('Shift')
  await page.mouse.down()
  await wait(POINT_HOLD_WAIT_MS)
  await page.mouse.up()
  await page.keyboard.up('Shift')
}
