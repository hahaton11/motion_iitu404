import { speechSupported } from '../voice'
import type { AppContext } from './context'
import { el } from './dom'
import { cameraLine, micAdvice, micLine, type PermissionLine } from './permissions'

/** Плашка «Камера ✓ · Микрофон ✓» и подсказка, где включить отказанное. Для экранов старта и камеры. */

export interface PermissionsView {
  readonly node: HTMLElement
  destroy(): void
}

function paint(chip: HTMLElement, line: PermissionLine): void {
  chip.textContent = line.label
  chip.dataset.mark = line.mark
}

export function permissionsView(ctx: AppContext): PermissionsView {
  const cam = el('span', 'app-perm')
  const mic = el('span', 'app-perm')
  const advice = el('p', 'app-perm-advice')
  const node = el('div', 'app-perms', el('div', 'app-perm-row', cam, mic), advice)
  const speech = speechSupported()
  const sync = () => {
    const mouse = ctx.flow().mode === 'mouse'
    paint(cam, cameraLine(ctx.cameraStatus().phase))
    cam.hidden = mouse
    paint(mic, micLine(ctx.micAccess(), speech))
    advice.textContent = micAdvice(ctx.micAccess(), speech) ?? ''
  }
  const offs = [ctx.onCameraStatus(sync), ctx.onMicAccess(sync)]
  sync()
  return {
    node,
    destroy: () => offs.forEach((off) => off()),
  }
}
