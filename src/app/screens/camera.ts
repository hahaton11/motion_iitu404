import type { MotionHintCode } from '../../contracts/input'
import type { AppContext, ScreenHandle } from '../context'
import { el, icon, isolate, text } from '../dom'

/** Камера: доступ, индикатор «Вижу руку», подсказки о расстоянии и свете, выход в режим мыши. */

/** Рука считается видимой, если курсор приходил не позже этого. */
const SEEN_MS = 600
const POLL_MS = 250
/** Столько ждём ответа на запрос доступа, прежде чем подсказать, где его разрешить. */
const PROMPT_HINT_MS = 7000
const PROMPT_HINT = 'Разреши доступ к камере во всплывающем окне браузера или выбери режим мыши'
const INLINE_CODES: readonly MotionHintCode[] = ['TOO_FAR', 'TOO_CLOSE', 'POOR_TRACKING', 'HAND_NEAR_EDGE']

const PHASE_TITLE = {
  off: 'Включаю камеру…',
  loading: 'Включаю камеру и загружаю распознавание рук…',
  ready: 'Камера включена',
  failed: 'Камера не включилась',
} as const

export function mountCamera(ctx: AppContext): ScreenHandle {
  if (ctx.cameraStatus().phase === 'off') ctx.startCamera()
  let lastSeen = -Infinity
  const mountedAt = performance.now()
  const title = el('h2', 'app-title')
  const status = el('p', 'app-status')
  const seen = el('div', 'app-seen', icon('palm'), text('span', '', 'Подними руку в кадр ладонью к экрану'))
  const tip = el('p', 'app-tip')
  const next = ctx.buttons.create({ label: 'Дальше', icon: 'palm', onPress: () => ctx.send({ type: 'cameraReady' }) })
  const mouse = ctx.buttons.create({
    label: 'Попробовать с мышью',
    variant: 'ghost',
    icon: 'point',
    onPress: () => {
      ctx.sound.unlock()
      ctx.switchToMouse()
      ctx.send({ type: 'useMouse' })
    },
  })
  const card = el('div', 'app-card app-camera', title, status, seen, tip, el('div', 'app-row', next, mouse))
  const screen = el('section', 'app-screen is-full is-camera', isolate(card))
  ctx.layer.append(screen)

  const sync = () => {
    const cam = ctx.cameraStatus()
    const visible = cam.phase === 'ready' && performance.now() - lastSeen < SEEN_MS
    title.textContent = PHASE_TITLE[cam.phase]
    const waiting = cam.phase === 'loading' && performance.now() - mountedAt > PROMPT_HINT_MS
    status.textContent = cam.phase === 'failed' ? (cam.message ?? '') : waiting ? PROMPT_HINT : ''
    seen.classList.toggle('is-on', visible)
    seen.hidden = cam.phase !== 'ready'
    const label = seen.querySelector('span')
    if (label) label.textContent = visible ? 'Вижу руку' : 'Подними руку в кадр ладонью к экрану'
    next.disabled = !visible
    mouse.classList.toggle('is-primary', cam.phase === 'failed')
    mouse.classList.toggle('is-ghost', cam.phase !== 'failed')
  }
  const offs = [
    ctx.onCameraStatus(sync),
    ctx.hub.raw.on('cursor', () => (lastSeen = performance.now())),
    ctx.hub.raw.on('hint', (h) => {
      if ((INLINE_CODES as readonly string[]).includes(h.code)) tip.textContent = h.message
    }),
  ]
  const timer = setInterval(sync, POLL_MS)
  sync()
  return {
    destroy: () => {
      clearInterval(timer)
      offs.forEach((off) => off())
      screen.remove()
    },
  }
}
