import { expect, test, type Page } from '@playwright/test'
import { MIC_ADVICE } from '../src/app/permissions'

/**
 * Микрофон спрашивается на старте. Отказ не ломает приложение: голос выключен, остальное работает.
 * Ответ браузера подменяется: поддельный звук Chromium в headless на macOS зависает навсегда.
 */

async function answerMic(page: Page, allow: boolean): Promise<void> {
  await page.addInitScript((ok) => {
    navigator.mediaDevices.getUserMedia = (c?: MediaStreamConstraints) => {
      if (!c?.audio) return Promise.reject(new DOMException('No camera here', 'NotFoundError'))
      return ok ? Promise.resolve(new MediaStream()) : Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
    }
  }, allow)
}

const micChip = (page: Page) => page.locator('.app-perm', { hasText: 'Микрофон' })

test('mouse: the microphone is asked at start and shown as allowed', async ({ page }) => {
  await answerMic(page, true)
  await page.goto('./?input=mouse')
  await expect(micChip(page)).toHaveText('Микрофон ✓')
  await expect(page.locator('.app-perm-advice')).toBeHidden()
})

test('mouse: a refused microphone is explained and the app keeps working', async ({ page }) => {
  await answerMic(page, false)
  await page.goto('./?input=mouse')
  await expect(micChip(page)).toHaveText('Микрофон ✗')
  await expect(page.locator('.app-perm-advice')).toHaveText(MIC_ADVICE.denied)
  await page.getByRole('button', { name: 'Начать' }).click()
  await expect(page.locator('.app-tut-progress')).toHaveText(/Шаг 1 из/)
})
