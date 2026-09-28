import { CALIBRATION_PROMPTS, type CalibrationProgress } from '../../motion'
import type { AppContext, ScreenHandle } from '../context'
import { el, icon, isolate, text } from '../dom'

/** Калибровка щипка: пальцы разведены, затем сомкнуты, с анимированной рукой и полосой прогресса. */

const DONE_DELAY_MS = 1100

export function mountCalibration(ctx: AppContext): ScreenHandle {
  const camera = ctx.camera()
  if (!camera) {
    ctx.send({ type: 'skipCalibration' })
    return { destroy: () => undefined }
  }
  let alive = true
  let timer: ReturnType<typeof setTimeout> | undefined
  const hand = el('div', 'app-calib-hand', icon('palm', 'app-calib-palm'), icon('fist', 'app-calib-fist'))
  const prompt = text('h2', 'app-title', CALIBRATION_PROMPTS.open)
  const bar = el('div', 'app-bar', el('div', 'app-bar-fill'))
  const steps = el('ol', 'app-steps', text('li', 'is-open', 'Пальцы врозь'), text('li', 'is-fist', 'Щипок'))
  const note = text('p', 'app-caption', 'Держи руку перед камерой, пока полоса не заполнится. Это подстроит жесты под твою руку')
  const retry = ctx.buttons.create({ label: 'Повторить', icon: 'palm', onPress: () => run() })
  const skip = ctx.buttons.create({ label: 'Пропустить', variant: 'ghost', onPress: () => ctx.send({ type: 'skipCalibration' }) })
  retry.hidden = true
  const card = el('div', 'app-card app-calib', hand, steps, prompt, bar, note, el('div', 'app-row', retry, skip))
  const screen = el('section', 'app-screen is-full is-calibration', isolate(card))
  ctx.layer.append(screen)

  const show = (p: CalibrationProgress) => {
    card.dataset.step = p.step
    prompt.textContent = p.prompt
    bar.style.setProperty('--p', String(p.step === 'done' ? 1 : p.progress))
  }
  const run = () => {
    retry.hidden = true
    card.dataset.step = 'open'
    camera
      .calibrate(show)
      .then(() => {
        if (!alive) return
        ctx.sound.play('step')
        timer = setTimeout(() => ctx.send({ type: 'calibrated' }), DONE_DELAY_MS)
      })
      .catch((err: unknown) => {
        if (!alive) return
        card.dataset.step = 'failed'
        prompt.textContent = err instanceof Error ? err.message : CALIBRATION_PROMPTS.failed
        retry.hidden = false
      })
  }
  run()
  return {
    destroy: () => {
      alive = false
      clearTimeout(timer)
      screen.remove()
    },
  }
}
