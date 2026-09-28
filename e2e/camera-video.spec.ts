import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { GESTURES_VIDEO } from './assets'

/**
 * Смоук на записанном видео жестов: Chrome отдаёт gestures.y4m как веб-камеру.
 * Видео записывается кнопкой в motion.html, конвертация:
 * ffmpeg -i gestures.webm -pix_fmt yuv420p test-assets/gestures.y4m
 */

/** Запись длится 30 секунд, берём с запасом на загрузку модели. */
const WATCH_MS = 45_000
const EXPECTED = ['grab', 'release', 'throw', 'hint'] as const

test.skip(!existsSync(GESTURES_VIDEO), 'нет test-assets/gestures.y4m: запиши видео в motion.html')

test('camera video: grab, release, throw and a hint', async ({ page }) => {
  test.setTimeout(WATCH_MS + 30_000)
  await page.goto('./motion.html')
  await page.evaluate(() => {
    const seen: string[] = []
    Object.assign(window, { __seen: seen })
    const log = document.querySelector('[data-f="log"]')
    if (!log) throw new Error('motion log not found')
    new MutationObserver((records) =>
      records.forEach((r) => r.addedNodes.forEach((n) => seen.push(n.textContent ?? ''))),
    ).observe(log, { childList: true })
  })
  await page.getByRole('button', { name: 'Включить камеру' }).click()
  await expect(page.getByRole('button', { name: 'Камера включена' })).toBeVisible({ timeout: 30_000 })

  const seenAll = () =>
    page.evaluate((types) => {
      const seen = (window as unknown as { __seen: string[] }).__seen
      return types.filter((t) => !seen.some((line) => line.includes(` ${t} `)))
    }, [...EXPECTED])
  await expect.poll(seenAll, { timeout: WATCH_MS, intervals: [1000] }).toEqual([])
})
