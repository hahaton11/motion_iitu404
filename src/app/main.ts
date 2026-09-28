import type { InputEventType, InputSource } from '../contracts/input'
import { MouseInput } from '../shared/mouse-input'

/** Временная отладочная страница S0: показывает поток событий контракта. Заменяется в S4. */
const LOGGED: readonly InputEventType[] = ['grab', 'release', 'throw', 'point', 'zoom', 'handlost', 'hint']
const MAX_LINES = 20

function mountDebug(root: HTMLElement, input: InputSource): void {
  const log = Object.assign(document.createElement('div'), { className: 'log' })
  const cursor = Object.assign(document.createElement('div'), { className: 'cursor' })
  root.append(log, cursor)

  input.on('cursor', (e) => {
    cursor.style.left = `${e.x * 100}%`
    cursor.style.top = `${e.y * 100}%`
    cursor.style.transform = `scale(${1 - e.closure * 0.4})`
  })
  LOGGED.forEach((type) =>
    input.on(type, (e) => {
      const line = document.createElement('div')
      line.textContent = `${type} ${JSON.stringify(e)}`
      log.prepend(line)
      while (log.childElementCount > MAX_LINES) log.lastElementChild?.remove()
    }),
  )
}

const root = document.getElementById('app')
if (!root) throw new Error('#app not found')
const input = new MouseInput(window)
mountDebug(root, input)
void input.start()
