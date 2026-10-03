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
  // Пока доска масштабируется, в углу стоит цифра: у зума щипком нет другой опоры.
  await expect(page.locator('.mb-zoom.is-on')).toHaveText(`${Math.round(zoomedIn.zoom * 100)} %`)
  await expect(page.locator('.mb-zoom.is-on')).toHaveCount(0, { timeout: 3_000 })
  expect(await held(page)).toBe(false)
  await expect(page.locator('.mb-cursor.is-zoom')).toHaveCount(0)

  await altDrag(page, over, { x: over.x, y: over.y + 200 })
  // Ход вниз на то же расстояние возвращает масштаб: экспонента делает шаги взаимно обратными.
  expect((await camera(page)).zoom).toBeCloseTo(start.zoom, 1)

  await page.mouse.move(640, 400)
  await page.mouse.wheel(0, -300)
  await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(start.zoom)
})

/*
 * Отпускание кнопки может не дойти до страницы: окно теряет фокус посреди перетаскивания,
 * система забирает жест себе, браузер съедает событие. Нашлось на эмуляторе — Chrome
 * не доставил pointerup, пришедший с зажатым Alt, — и кончилось тем, что курсор стоял лупой
 * навсегда: доска работала, а рука к ней больше не относилась, и демо выглядело мёртвым.
 *
 * Саму потерю приёмами Playwright воспроизвести не удаётся: мышь он держит в согласованном
 * состоянии. Поэтому события подаются прямо в окно — так проверяется само правило «движение
 * с ненажатой кнопкой заканчивает жест», а не то, при каких условиях браузер теряет отпускание.
 */
test('mouse: a drag whose release never arrived ends on the first move without a button', async ({ page }) => {
  await page.goto('./board.html')
  await expect(page.locator('.mb-el').first()).toBeVisible()
  const send = (type: string, x: number, y: number, buttons: number, alt = false) =>
    page.evaluate(
      (e) =>
        window.dispatchEvent(
          new PointerEvent(e.type, { clientX: e.x, clientY: e.y, buttons: e.buttons, altKey: e.alt, button: 0, bubbles: true }),
        ),
      { type, x, y, buttons, alt },
    )

  await send('pointermove', 640, 400, 0)
  await send('pointerdown', 640, 400, 1, true)
  await send('pointermove', 640, 340, 1, true)
  await expect(page.locator('.mb-cursor.is-zoom')).toBeVisible()

  // Отпускания нет вовсе: следующее движение приходит с ненажатой кнопкой.
  await send('pointermove', 500, 500, 0)
  await expect(page.locator('.mb-cursor.is-zoom')).toHaveCount(0)
  const at = await page.locator('.mb-cursor').first().evaluate((el) => (el as HTMLElement).style.transform)
  expect(at).toContain('500px')
})
