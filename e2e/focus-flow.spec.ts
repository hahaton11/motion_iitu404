import { expect, test, type Page } from '@playwright/test'

/**
 * Смоук управления фокусом на MouseInput с ?nav=focus: стрелки — взмахи, кнопка мыши — кулак.
 * Положение мыши не важно, курсор ставит прослойка фокуса. Проходит обучение из четырёх шагов.
 */

const STEP_MS = 250
const POCKET_OPEN_MS = 900
const SPAWN_MS = 700

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function swipe(page: Page, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'): Promise<void> {
  await page.keyboard.press(key)
  await wait(STEP_MS)
}

/** Мышь стоит на месте, чтобы не было броска, и двигается на пиксель, чтобы шли события курсора. */
async function nudge(page: Page): Promise<void> {
  await page.mouse.move(641, 401)
  await page.mouse.move(640, 400)
  await wait(STEP_MS)
}

test('focus navigation: tutorial with swipes only', async ({ page }) => {
  await page.goto('./?input=mouse&nav=focus')
  await page.getByRole('button', { name: 'Начать' }).click()
  await page.mouse.move(640, 400)
  const progress = page.locator('.app-tut-progress')

  await expect(progress).toHaveText('Шаг 1 из 4')
  await wait(SPAWN_MS)
  await nudge(page)
  await page.mouse.down()
  await swipe(page, 'ArrowRight')
  await nudge(page)
  await page.mouse.up()
  await expect(progress).toHaveText('Шаг 2 из 4')

  await wait(SPAWN_MS)
  await nudge(page)
  await page.mouse.down()
  await wait(STEP_MS)
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(640 - i * 70, 400)
    await wait(8)
  }
  await page.mouse.up()
  await expect(progress).toHaveText('Шаг 3 из 4')

  await page.mouse.move(640, 400)
  await swipe(page, 'ArrowDown')
  for (let i = 0; i < 8; i++) await nudge(page)
  await wait(POCKET_OPEN_MS)
  await swipe(page, 'ArrowRight')
  await nudge(page)
  await page.mouse.down()
  await expect(progress).toHaveText('Шаг 4 из 4')

  await swipe(page, 'ArrowUp')
  await nudge(page)
  await swipe(page, 'ArrowDown')
  await nudge(page)
  await nudge(page)
  await page.mouse.up()
  await expect(page.locator('.app-tut.is-done')).toBeVisible()
})
