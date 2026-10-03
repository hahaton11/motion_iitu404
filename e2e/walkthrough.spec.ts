import { expect, test, type Page } from '@playwright/test'
import { CLUSTERS, IDEAS, TRASH_TITLE, ideaElementId, type IdeaTarget } from '../src/app/challenge'
import { TUTORIAL_STEPS } from '../src/app/tutorial'
import { centerOf, click, drag, fling, glide, panBoard, pointAt, putInPocket, takeFromPocket, zoomBoard, type Point } from './gestures'

/**
 * Прогон по всему функционалу с записью видео и снимками экранов: старт и разрешения, семь шагов
 * обучения, панорама, зум, карман, диктовка, челлендж, финал с разбором ошибок.
 *
 * Это не смоук — за сквозной путь отвечает mouse-flow.spec.ts. Здесь всё делается медленнее,
 * с паузами на чтение карточек, чтобы запись можно было показывать: на финале нужен запасной
 * ролик, если на живом демо не встанет камера или не будет света.
 *
 * Видео и снимки кладутся в test-results/, в репозиторий не попадают. Запуск:
 * npx playwright test --project=walkthrough
 */

test.use({ video: { mode: 'on', size: { width: 1280, height: 800 } } })

/** Пауза, за которую успевает прочитаться карточка шага на записи. */
const READ_MS = 1400
const SPAWN_MS = 700

const ZONE_TITLE: Readonly<Record<IdeaTarget, string>> = {
  ...Object.fromEntries(CLUSTERS.map((c) => [c.id, c.title])),
  trash: TRASH_TITLE,
} as Readonly<Record<IdeaTarget, string>>

const SPREAD = [-0.3, 0, 0.3, -0.15] as const

const spawnTextOf = (id: string): string => {
  const step = TUTORIAL_STEPS.find((s) => s.id === id)
  if (!step?.spawnText) throw new Error(`tutorial step ${id} has no spawnText`)
  return step.spawnText
}

const stepLabel = (n: number) => `Шаг ${n} из ${TUTORIAL_STEPS.length}`

let shotNo = 0
/** Снимок всего экрана с номером по порядку: кадры складываются в раскадровку прохода. */
async function shot(page: Page, name: string): Promise<void> {
  shotNo += 1
  await page.screenshot({ path: `test-results/walkthrough/${String(shotNo).padStart(2, '0')}-${name}.png` })
}

const zone = (page: Page, target: IdeaTarget) =>
  page.locator('.app-zone').filter({ has: page.locator('.app-zone-title', { hasText: ZONE_TITLE[target] }) })

async function slotIn(page: Page, target: IdeaTarget, slot: number): Promise<Point> {
  const box = await zone(page, target).boundingBox()
  if (!box) throw new Error(`zone ${target} is not visible`)
  const dx = SPREAD[slot % SPREAD.length] ?? 0
  return { x: box.x + box.width * (0.5 + dx), y: box.y + box.height * 0.6 }
}

test('walkthrough: every feature on the way from the start screen to the final', async ({ page }) => {
  await page.goto('./?input=mouse')
  await shot(page, 'start')
  await page.getByRole('button', { name: 'Начать' }).click()
  await page.mouse.move(640, 400)
  const progress = page.locator('.app-tut-progress')
  const practice = (label: string) => page.locator('[data-id="tut-practice"]', { hasText: label })
  const vp = page.viewportSize()!
  const cx = vp.width / 2

  await expect(progress).toHaveText(stepLabel(1))
  await page.waitForTimeout(READ_MS)
  await shot(page, 'tutorial-move')
  await drag(page, await centerOf(practice(spawnTextOf('move'))), await centerOf(page.locator('.app-zone')))
  await expect(progress).toHaveText(stepLabel(2))

  await expect(practice(spawnTextOf('throw'))).toBeVisible()
  await page.waitForTimeout(SPAWN_MS + READ_MS)
  await shot(page, 'tutorial-throw')
  await fling(page, await centerOf(practice(spawnTextOf('throw'))))
  await expect(progress).toHaveText(stepLabel(3))

  await page.waitForTimeout(READ_MS)
  await shot(page, 'tutorial-pan-before')
  const markAt = await centerOf(page.locator('.app-zone'))
  await panBoard(page, { x: cx + 280, y: vp.height / 2 }, { x: cx + 280 - (markAt.x - cx), y: vp.height / 2 })
  await expect(progress).toHaveText(stepLabel(4), { timeout: 5_000 })
  await shot(page, 'tutorial-pan-done')

  await page.waitForTimeout(READ_MS)
  await shot(page, 'tutorial-zoom-before')
  await zoomBoard(page, { x: cx, y: vp.height * 0.6 }, -240)
  await expect(progress).toHaveText(stepLabel(5), { timeout: 5_000 })

  await page.waitForTimeout(READ_MS)
  await shot(page, 'tutorial-take')
  const taken = await takeFromPocket(page)
  await expect(progress).toHaveText(stepLabel(6))
  await shot(page, 'pocket-open')

  const mid = { x: taken.x, y: vp.height * 0.55 }
  await glide(page, taken, mid)
  await putInPocket(page, mid)
  await expect(progress).toHaveText(stepLabel(7))

  const sticky = practice(spawnTextOf('voice'))
  await expect(sticky).toBeVisible()
  await page.waitForTimeout(SPAWN_MS + READ_MS)
  const at = await centerOf(sticky)
  await glide(page, mid, at)
  await expect(page.locator('.vc-tip.is-on')).toContainText('Shift')
  await shot(page, 'tutorial-voice')
  await pointAt(page, at)
  await expect(page.locator('.app-tut.is-done')).toBeVisible({ timeout: 15_000 })
  await shot(page, 'tutorial-done')

  await expect(page.locator('.app-ch')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-id^="ch-"]')).toHaveCount(IDEAS.length)
  await page.waitForTimeout(READ_MS)
  await shot(page, 'challenge-start')

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
  await shot(page, 'challenge-sorted')

  const extra = await takeFromPocket(page)
  await glide(page, extra, await slotIn(page, 'comms', 3))
  await click(page)

  const final = page.locator('.app-final')
  await expect(final).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(READ_MS)
  await shot(page, 'final')
  await expect(final.getByRole('button', { name: 'Ещё раз' })).toBeVisible()
})
