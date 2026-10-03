import { expect, test, type Page } from '@playwright/test'
import { glide, type Point } from './gestures'

/**
 * Смоук зума на MouseInput: Alt и перетаскивание вверх приближают доску, вниз отдаляют,
 * курсор стоит лупой, элемент под курсором не берётся. Колесо зумит как раньше.
 */

interface Camera {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

interface BoardProbe {
  getState(): { camera: Camera; held?: unknown }
}

const camera = (page: Page): Promise<Camera> =>
  page.evaluate(() => (window as unknown as { board: BoardProbe }).board.getState().camera)

const held = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as { board: BoardProbe }).board.getState().held !== undefined)

async function altDrag(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.keyboard.down('Alt')
  await page.mouse.down()
  await glide(page, from, to)
  await expect(page.locator('.mb-cursor.is-zoom')).toBeVisible()
  await page.mouse.up()
  await page.keyboard.up('Alt')
}

test('mouse: Alt-drag up zooms in, down zooms out, over an element nothing is taken', async ({ page }) => {
  await page.goto('./board.html')
  const first = page.locator('.mb-el').first()
  await expect(first).toBeVisible()
  const box = await first.boundingBox()
  if (!box) throw new Error('element is not visible')
  const over: Point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const start = await camera(page)

  await altDrag(page, over, { x: over.x, y: over.y - 200 })
  const zoomedIn = await camera(page)
  expect(zoomedIn.zoom).toBeGreaterThan(start.zoom * 1.5)
  expect(await held(page)).toBe(false)
  await expect(page.locator('.mb-cursor.is-zoom')).toHaveCount(0)

  await altDrag(page, over, { x: over.x, y: over.y + 200 })
  // Ход вниз на то же расстояние возвращает масштаб: экспонента делает шаги взаимно обратными.
  expect((await camera(page)).zoom).toBeCloseTo(start.zoom, 1)

  await page.mouse.move(640, 400)
  await page.mouse.wheel(0, -300)
  await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(start.zoom)
})
