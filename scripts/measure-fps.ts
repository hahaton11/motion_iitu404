import { spawn } from 'node:child_process'
import { chromium, type Page } from '@playwright/test'

/**
 * Замер FPS доски под нагрузкой: 50 элементов, непрерывная панорама и зум.
 * Окно видимое: в скрытом окне Chrome не компонует кадры и цифра получается ложной.
 *
 * npx tsx scripts/measure-fps.ts                 # три прогона текущего оформления
 * npx tsx scripts/measure-fps.ts --runs 5
 * npx tsx scripts/measure-fps.ts --all           # сравнить варианты тени между собой
 */

const PORT = 4318
const URL = `http://localhost:${PORT}/board.html`
const WARMUP_MS = 1200
const MEASURE_MS = 4000
const DEFAULT_RUNS = 3

interface Sample {
  readonly fps: number
  readonly frames: number
  readonly elapsed: number
  readonly worstFrameMs: number
}

function runsFromArgv(): number {
  const i = process.argv.indexOf('--runs')
  const raw = i >= 0 ? Number(process.argv[i + 1]) : NaN
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_RUNS
}

async function startPreview(): Promise<() => void> {
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL)
      if (res.ok) return () => child.kill()
    } catch {
      /* сервер ещё не поднялся */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  child.kill()
  throw new Error(`vite preview не поднялся на ${PORT}, сначала npm run build`)
}

/**
 * Крутит камеру через rAF и считает кадры внутри страницы.
 * Исходником, а не функцией: tsx переписывает функции и в браузере падает `__name is not defined`.
 */
const spin = (ms: number): string => `new Promise((resolve) => {
  const board = window.board
  let frames = 0
  let worstFrameMs = 0
  const start = performance.now()
  let prev = start
  const loop = (t) => {
    frames += 1
    worstFrameMs = Math.max(worstFrameMs, t - prev)
    prev = t
    const e = t - start
    board.setCamera({ x: Math.sin(e / 520) * 260, y: Math.cos(e / 610) * 140, zoom: 0.75 + 0.35 * Math.sin(e / 430) })
    if (e < ${ms}) requestAnimationFrame(loop)
    else resolve({ fps: (frames * 1000) / e, frames, elapsed: e, worstFrameMs })
  }
  requestAnimationFrame(loop)
})`

/**
 * Варианты оформления тени, чтобы отделить стоимость размытия от всего остального.
 * Накладываются поверх собранного CSS, код при этом не трогается.
 */
const VARIANTS: Readonly<Record<string, string>> = {
  base: '',
  'no-blur': '.mb-shadow { filter: none !important; }',
  'no-shadow': '.mb-shadow { display: none !important; }',
  'box-shadow': `
    .mb-shadow { filter: none !important; background: none !important; box-shadow: 0 5px 14px 2px var(--mb-shadow) !important; }
    .mb-el[data-kind='triangle'] .mb-shadow::before { display: none !important; }
  `,
  'box-small': `
    .mb-shadow { filter: none !important; background: none !important; box-shadow: 0 4px 9px var(--mb-shadow) !important; }
    .mb-el[data-kind='triangle'] .mb-shadow::before { display: none !important; }
  `,
  gradient: `
    .mb-shadow { filter: none !important; background: radial-gradient(closest-side, var(--mb-shadow), transparent) !important; }
    .mb-el[data-kind='triangle'] .mb-shadow::before { background: radial-gradient(closest-side, var(--mb-shadow), transparent) !important; }
  `,
  'lift-only': `
    .mb-shadow { filter: none !important; background: radial-gradient(closest-side, var(--mb-shadow), transparent) !important; }
    .mb-el.is-lifted .mb-shadow { filter: blur(12px) !important; background: var(--mb-shadow) !important; }
  `,
}

async function measure(page: Page, css: string): Promise<Sample> {
  await page.goto(URL)
  if (css) await page.addStyleTag({ content: css })
  await page.getByRole('button', { name: /\+50 штук/ }).click()
  await page.waitForFunction('document.querySelectorAll(".mb-el").length >= 50')
  await page.evaluate(spin(WARMUP_MS))
  return page.evaluate(spin(MEASURE_MS)) as Promise<Sample>
}

async function main(): Promise<void> {
  const stop = await startPreview()
  const browser = await chromium.launch({ headless: false })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const runs = runsFromArgv()
    const chosen = process.argv.includes('--all') ? Object.entries(VARIANTS) : [['base', ''] as const]
    /* Варианты чередуются, чтобы прогрев машины не достался одному из них. */
    const byVariant = new Map<string, Sample[]>()
    for (let i = 0; i < runs; i++) {
      for (const [name, css] of chosen) {
        const s = await measure(page, css)
        byVariant.set(name, [...(byVariant.get(name) ?? []), s])
        process.stdout.write(`${name} #${i + 1}: ${s.fps.toFixed(1)} FPS, худший кадр ${s.worstFrameMs.toFixed(0)} мс\n`)
      }
    }
    process.stdout.write('\nмедиана по вариантам:\n')
    for (const [name, list] of byVariant) {
      const sorted = [...list].map((s) => s.fps).sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0
      process.stdout.write(`  ${name.padEnd(12)} ${median.toFixed(1)} FPS\n`)
    }
  } finally {
    await browser.close()
    stop()
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${String(err)}\n`)
  process.exitCode = 1
})
