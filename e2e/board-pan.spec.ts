import { expect, test, type Page } from '@playwright/test'
import { glide, type Point } from './gestures'

/** Смоук панорамы на MouseInput: правая кнопка и пробел с ЛКМ тянут доску, ЛКМ на пустом месте — нет. */

/**
 * Пустое место демо-доски при окне 1280×800: ниже и правее засеянных фигур.
 *
 * Точка опущена с y=720 после наклона доски. Наклон сжимает мировые координаты у ближнего
 * края, и (1000, 720) стала переводиться в мир как (313, 310) — ровно на границе магнитного
 * фокуса фигуры с центром (230, 150): её половина стороны 80 плюс радиус фокуса 80 дают 310.
 * Пустое место перестало быть пустым не из-за ошибки, а потому что под тем же пикселем
 * теперь другая точка мира. Остальные точки внизу проверены: там магнита нет.
 */
const EMPTY: Point = { x: 900, y: 770 }
const SHIFT: Point = { x: EMPTY.x + 120, y: EMPTY.y - 40 }

interface Camera {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

const camera = (page: Page): Promise<Camera> =>
  page.evaluate(() => (window as unknown as { board: { getState(): { camera: Camera } } }).board.getState().camera)

async function dragWith(page: Page, button: 'left' | 'right' | 'middle'): Promise<void> {
  await page.mouse.move(EMPTY.x, EMPTY.y)
  await page.mouse.down({ button })
  await glide(page, EMPTY, SHIFT)
  await page.mouse.up({ button })
}

test('mouse: pan with the right button and with space, not with a fist on empty space', async ({ page }) => {
  await page.goto('./board.html')
  await expect(page.locator('.mb-el').first()).toBeVisible()
  const start = await camera(page)

  await dragWith(page, 'left')
  expect(await camera(page)).toEqual(start)
  await expect(page.locator('.demo-hint')).toContainText('два пальца')

  await dragWith(page, 'right')
  const afterRight = await camera(page)
  expect(afterRight.x).toBeCloseTo(start.x - (SHIFT.x - EMPTY.x), 0)
  expect(afterRight.y).toBeCloseTo(start.y - (SHIFT.y - EMPTY.y), 0)

  await page.keyboard.down('Space')
  await dragWith(page, 'left')
  await page.keyboard.up('Space')
  const afterSpace = await camera(page)
  expect(afterSpace.x).toBeCloseTo(afterRight.x - (SHIFT.x - EMPTY.x), 0)
})
