import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

/**
 * Печатает docs/presentation/deck.html в public/presentation.pdf.
 *
 * Презентация собирается из исходника в репозитории, а не правится в редакторе: текст и цифры
 * в ней те же, что в README, и расходиться им нельзя — жюри читает оба. Размер страницы равен
 * размеру слайда, 1280×720, поэтому PDF открывается без полей и листается как слайды.
 *
 * Запуск: npm run deck
 */

const SLIDE = { width: '1280px', height: '720px' }

const deck = fileURLToPath(new URL('../docs/presentation/deck.html', import.meta.url))
const out = fileURLToPath(new URL('../public/presentation.pdf', import.meta.url))

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`file://${deck}`, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'screen' })
await page.pdf({ path: out, ...SLIDE, printBackground: true, pageRanges: '1-' })
await browser.close()

const slides = await (async () => {
  const b = await chromium.launch()
  const p = await b.newPage()
  await p.goto(`file://${deck}`)
  const n = await p.locator('.slide').count()
  await b.close()
  return n
})()

console.log(`presentation.pdf: ${slides} слайдов → public/presentation.pdf`)
