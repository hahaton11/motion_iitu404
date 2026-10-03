import { defineConfig, devices } from '@playwright/test'
import { GESTURES_VIDEO } from './e2e/assets'

/**
 * Смоук-тесты в скачанном Chromium Playwright на собранной версии, как на деплое.
 * Не входят в npm test и в деплой: запуск npm run e2e.
 * Проект camera-video подаёт записанное видео жестов как веб-камеру Chrome.
 * Без файла test-assets/gestures.y4m его тест пропускается.
 */

const PORT = 4317

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mouse', testIgnore: /camera-video\.spec\.ts|walkthrough\.spec\.ts/ },
    // Прогон по всему функционалу с записью видео и снимками. В смоук не входит: он медленный
    // нарочно, с паузами на чтение карточек, и нужен ради самой записи — запасного ролика к финалу.
    { name: 'walkthrough', testMatch: /walkthrough\.spec\.ts/ },
    {
      name: 'camera-video',
      testMatch: /camera-video\.spec\.ts/,
      use: {
        permissions: ['camera'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-video-capture=${GESTURES_VIDEO}`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
