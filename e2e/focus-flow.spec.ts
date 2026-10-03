import { expect, test, type Page } from '@playwright/test'
import { TUTORIAL_STEPS } from '../src/app/tutorial'
import { centerOf, click, fling, panBoard, zoomBoard } from './gestures'

/**
 * Смоук управления фокусом на MouseInput с ?nav=focus: стрелки — взмахи, клик — взять или положить.
 * Положение мыши не важно, курсор ставит прослойка фокуса. Проходит обучение, шаг диктовки пропускает кнопкой.
 */

const STEP_MS = 250
const POCKET_OPEN_MS = 900
const SPAWN_MS = 700
/** Карман забирает элемент через STASH_DWELL_MS над ним, ждём с запасом. */
const STASH_WAIT_MS = 700

const stepLabel = (n: number) => `Шаг ${n} из ${TUTORIAL_STEPS.length}`

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

  await expect(progress).toHaveText(stepLabel(1))
  await wait(SPAWN_MS)
  await nudge(page)
  await click(page)
  await swipe(page, 'ArrowRight')
  await nudge(page)
  await click(page)
  await expect(progress).toHaveText(stepLabel(2))

  await wait(SPAWN_MS)
  await nudge(page)
  await fling(page, { x: 640, y: 400 })
  await expect(progress).toHaveText(stepLabel(3))

  /*
   * Панорама и зум взмахами не делаются: это жесты самой доски, и прослойка фокуса
   * пропускает их через себя как есть. Поэтому здесь они и проверяются — что в режиме
   * фокуса доска по-прежнему двигается и масштабируется.
   */
  const markAt = await centerOf(page.locator('.app-zone'))
  await panBoard(page, { x: 920, y: 400 }, { x: 920 - (markAt.x - 640), y: 400 })
  await expect(progress).toHaveText(stepLabel(4), { timeout: 5_000 })
  await zoomBoard(page, { x: 640, y: 480 }, -240)
  await expect(progress).toHaveText(stepLabel(5), { timeout: 5_000 })

  await page.mouse.move(640, 400)
  await swipe(page, 'ArrowDown')
  for (let i = 0; i < 8; i++) await nudge(page)
  await wait(POCKET_OPEN_MS)
  await swipe(page, 'ArrowRight')
  await nudge(page)
  await click(page)
  await expect(progress).toHaveText(stepLabel(6))

  await swipe(page, 'ArrowUp')
  await nudge(page)
  await swipe(page, 'ArrowDown')
  await nudge(page)
  await nudge(page)
  await wait(STASH_WAIT_MS)
  await expect(progress).toHaveText(stepLabel(7))
  await page.getByRole('button', { name: 'Пропустить шаг' }).click()
  await expect(page.locator('.app-tut.is-done')).toBeVisible()
})
