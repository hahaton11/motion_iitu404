import { chromium } from '@playwright/test'
const src = 'file:///C:/Users/oxine/Downloads/video5337279227932747397.mp4'
const out = process.argv[2]
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
await p.setContent(`<body style="margin:0;background:#000"><video id="v" src="${src}" style="width:1280px"></video></body>`)
const meta = await p.evaluate(() => new Promise((res) => {
  const v = document.getElementById('v')
  v.onloadedmetadata = () => res({ d: v.duration, w: v.videoWidth, h: v.videoHeight })
  v.onerror = () => res({ error: String(v.error && v.error.code) })
}))
console.log('META', JSON.stringify(meta))
if (!meta.error) {
  const marks = [0.03, 0.2, 0.4, 0.6, 0.8, 0.97].map((f) => +(meta.d * f).toFixed(2))
  for (const [i, t] of marks.entries()) {
    await p.evaluate((t) => new Promise((res) => {
      const v = document.getElementById('v')
      v.onseeked = () => res(null)
      v.currentTime = t
    }), t)
    await p.waitForTimeout(250)
    await p.locator('#v').screenshot({ path: `${out}/frame-${i + 1}-${t}s.png` })
  }
  console.log('frames:', marks.join(', '))
}
await b.close()
