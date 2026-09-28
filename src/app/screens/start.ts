import type { AppContext, CameraStatus, ScreenHandle } from '../context'
import { el, isolate, text } from '../dom'
import type { InputMode } from '../flow'

/** Старт: название, одна фраза, крупная кнопка «Начать» и переключатель «Камера / Мышь». */

const STATUS_TEXT: Readonly<Record<CameraStatus['phase'], string>> = {
  off: 'Камера выключена',
  loading: 'Включаю камеру и загружаю распознавание рук…',
  ready: 'Камера готова: подними ладонь и задержи её на кнопке',
  failed: '',
}

export const MOUSE_HELP =
  'Мышь вместо рук: зажми левую кнопку — кулак, отпусти — ладонь, резкий бросок — удалить, Shift и удержание — указать пальцем'

function modeSwitch(ctx: AppContext, onChange: () => void): { node: HTMLElement; sync: () => void } {
  const make = (mode: InputMode, label: string) =>
    ctx.buttons.create({
      label,
      variant: 'small',
      icon: mode === 'camera' ? 'hand' : 'point',
      onPress: () => {
        ctx.send({ type: 'setMode', mode })
        if (mode === 'camera') ctx.startCamera()
        else ctx.switchToMouse()
        onChange()
      },
    })
  const cam = make('camera', 'Камера')
  const mouse = make('mouse', 'Мышь')
  const sync = () => {
    const mode = ctx.flow().mode
    cam.classList.toggle('is-active', mode === 'camera')
    mouse.classList.toggle('is-active', mode === 'mouse')
  }
  sync()
  return { node: el('div', 'app-switch', cam, mouse), sync }
}

export function mountStart(ctx: AppContext): ScreenHandle {
  const status = el('p', 'app-status')
  const start = ctx.buttons.create({
    label: 'Начать',
    icon: 'palm',
    className: 'is-huge',
    onPress: () => {
      ctx.sound.unlock()
      ctx.send({ type: 'start' })
    },
  })
  const free = ctx.buttons.create({ label: 'Свободная доска', variant: 'ghost', onPress: () => ctx.send({ type: 'free' }) })
  const sync = () => {
    const mode = ctx.flow().mode
    const cam = ctx.cameraStatus()
    status.textContent = mode === 'mouse' ? MOUSE_HELP : cam.phase === 'failed' ? (cam.message ?? '') : STATUS_TEXT[cam.phase]
    status.dataset.phase = mode === 'mouse' ? 'mouse' : cam.phase
    switcher.sync()
  }
  const switcher = modeSwitch(ctx, () => sync())
  const card = el(
    'div',
    'app-card app-start',
    el('h1', 'app-logo', 'Motion ', text('b', '', 'Board')),
    text('p', 'app-lead', 'Доска для брейншторма, которой управляют руками перед веб-камерой, как голограммой'),
    start,
    text('p', 'app-caption', 'Нажми или задержи открытую ладонь на кнопке одну секунду'),
    status,
    el('div', 'app-row', switcher.node, free),
  )
  const screen = el('section', 'app-screen is-full', isolate(card))
  ctx.layer.append(screen)
  const off = ctx.onCameraStatus(sync)
  sync()
  return {
    destroy: () => {
      off()
      screen.remove()
    },
  }
}
