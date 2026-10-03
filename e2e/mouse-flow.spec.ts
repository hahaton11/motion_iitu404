import { expect, test, type Page } from '@playwright/test'
import { CLUSTERS, IDEAS, TRASH_TITLE, ideaElementId, type IdeaTarget } from '../src/app/challenge'
import { TUTORIAL_STEPS } from '../src/app/tutorial'
import { centerOf, click, drag, fling, glide, pointAt, putInPocket, takeFromPocket, type Point } from './gestures'

/** Смоук на MouseInput: старт → обучение из пяти шагов → челлендж → финал. */

/**
 * Названия берутся из кода, а не выписываются здесь второй раз: выписанная копия расходится
 * с продуктом при первой же правке текстов, и тест начинает падать по причине, к которой
 * не имеет отношения.
 */
const ZONE_TITLE: Readonly<Record<IdeaTarget, string>> = {
  ...Object.fromEntries(CLUSTERS.map((c) => [c.id, c.title])),
  trash: TRASH_TITLE,
} as Readonly<Record<IdeaTarget, string>>

const spawnTextOf = (id: string): string => {
  const step = TUTORIAL_STEPS.find((s) => s.id === id)
  if (!step?.spawnText) throw new Error(`tutorial step ${id} has no spawnText`)
  return step.spawnText
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

const stepLabel = (n: number) => `Шаг ${n} из ${TUTORIAL_STEPS.length}`
/** Диктовка заканчивается сама паузой или таймаутом старта, если речь не распознаётся. */
const DICTATION_MS = 12_000

async function passTutorial(page: Page): Promise<void> {
  const progress = page.locator('.app-tut-progress')
  const practice = (label: string) => page.locator('[data-id="tut-practice"]', { hasText: label })
  await expect(progress).toHaveText(stepLabel(1))
  await drag(page, await centerOf(practice(spawnTextOf('move'))), await centerOf(page.locator('.app-zone')))
  await expect(progress).toHaveText(stepLabel(2))

  await expect(practice(spawnTextOf('throw'))).toBeVisible()
  await page.waitForTimeout(SPAWN_MS)
  await fling(page, await centerOf(practice(spawnTextOf('throw'))))
  await expect(progress).toHaveText(stepLabel(3))

  const taken = await takeFromPocket(page)
  await expect(progress).toHaveText(stepLabel(4))
  const vp = page.viewportSize()
  const mid = { x: taken.x, y: (vp?.height ?? 0) * 0.55 }
  await glide(page, taken, mid)
  await putInPocket(page, mid)

  await expect(progress).toHaveText(stepLabel(5))
  const sticky = practice(spawnTextOf('voice'))
  await expect(sticky).toBeVisible()
  await page.waitForTimeout(SPAWN_MS)
  const at = await centerOf(sticky)
  await glide(page, mid, at)
  await expect(page.locator('.vc-tip.is-on')).toContainText('Shift')
  await pointAt(page, at)
  await expect(page.locator('.app-tut.is-done')).toBeVisible({ timeout: DICTATION_MS })
}

async function sortIdeas(page: Page): Promise<void> {
  const used: Partial<Record<IdeaTarget, number>> = {}
  for (const idea of IDEAS) {
    const sticker = page.locator(`[data-id="${ideaElementId(idea)}"]`)
    const from = await centerOf(sticker)
    const slot = used[idea.target] ?? 0
    used[idea.target] = slot + 1
    if (idea.target === 'trash' && slot === 0) await fling(page, from)
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
  await glide(page, taken, await slotIn(page, 'comms', 3))
  await click(page)

  const final = page.locator('.app-final')
  await expect(final).toBeVisible({ timeout: 10_000 })
  await expect(final.locator('.app-stat', { hasText: 'точность' })).toContainText('100%')
  await expect(final.getByRole('button', { name: 'Ещё раз' })).toBeVisible()
})
