import { expect, test, type Page } from '@playwright/test'
import { IDEAS, ideaElementId, type IdeaTarget } from '../src/app/challenge'
import { centerOf, drag, fling, glide, takeFromPocket, type Point } from './gestures'

/** Смоук на MouseInput: старт → обучение из четырёх шагов → челлендж → финал. */

const ZONE_TITLE: Readonly<Record<IdeaTarget, string>> = {
  menu: 'Меню',
  promo: 'Продвижение',
  space: 'Интерьер',
  trash: 'Корзина',
}
/** Раскладка внутри зоны по горизонтали, доли ширины от центра. */
const SPREAD = [-0.3, 0, 0.3, -0.15] as const
/** Учебный стикер появляется с анимацией: человек берёт его не раньше, чем она закончится. */
const SPAWN_MS = 700

const zone = (page: Page, target: IdeaTarget) =>
  page.locator('.app-zone').filter({ has: page.locator('.app-zone-title', { hasText: ZONE_TITLE[target] }) })

async function slotIn(page: Page, target: IdeaTarget, slot: number): Promise<Point> {
  const box = await zone(page, target).boundingBox()
  if (!box) throw new Error(`zone ${target} is not visible`)
  const dx = SPREAD[slot % SPREAD.length] ?? 0
  return { x: box.x + box.width * (0.5 + dx), y: box.y + box.height * 0.6 }
}

async function passTutorial(page: Page): Promise<void> {
  const progress = page.locator('.app-tut-progress')
  const practice = (label: string) => page.locator('[data-id="tut-practice"]', { hasText: label })
  await expect(progress).toHaveText('Шаг 1 из 4')
  await drag(page, await centerOf(practice('Перенеси меня')), await centerOf(page.locator('.app-zone')))
  await expect(progress).toHaveText('Шаг 2 из 4')

  await expect(practice('Выброси меня')).toBeVisible()
  await page.waitForTimeout(SPAWN_MS)
  await fling(page, await centerOf(practice('Выброси меня')), -420)
  await expect(progress).toHaveText('Шаг 3 из 4')

  const taken = await takeFromPocket(page)
  await expect(progress).toHaveText('Шаг 4 из 4')
  const vp = page.viewportSize()
  const mid = { x: taken.x, y: (vp?.height ?? 0) * 0.55 }
  const inPocket = { x: taken.x, y: (vp?.height ?? 0) * 0.95 }
  await glide(page, taken, mid)
  await glide(page, mid, inPocket)
  await page.mouse.up()
  await expect(page.locator('.app-tut.is-done')).toBeVisible()
}

async function sortIdeas(page: Page): Promise<void> {
  const used: Partial<Record<IdeaTarget, number>> = {}
  for (const idea of IDEAS) {
    const sticker = page.locator(`[data-id="${ideaElementId(idea)}"]`)
    const from = await centerOf(sticker)
    const slot = used[idea.target] ?? 0
    used[idea.target] = slot + 1
    if (idea.target === 'trash' && slot === 0) await fling(page, from, 360)
    else await drag(page, from, await slotIn(page, idea.target, slot))
    if (idea.target === 'trash') await expect(sticker).toHaveCount(0)
  }
}

test('mouse: start, tutorial, challenge, final', async ({ page }) => {
  await page.goto('./?input=mouse')
  await page.getByRole('button', { name: 'Начать' }).click()
  await page.mouse.move(640, 400)

  await passTutorial(page)

  await expect(page.locator('.app-ch')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-id^="ch-"]')).toHaveCount(IDEAS.length)
  await sortIdeas(page)

  const taken = await takeFromPocket(page)
  await glide(page, taken, await slotIn(page, 'promo', 3))
  await page.mouse.up()

  const final = page.locator('.app-final')
  await expect(final).toBeVisible({ timeout: 10_000 })
  await expect(final.locator('.app-stat', { hasText: 'точность' })).toContainText('100%')
  await expect(final.getByRole('button', { name: 'Ещё раз' })).toBeVisible()
})
