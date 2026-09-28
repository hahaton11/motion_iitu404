import type { InputEventMap, InputEventType } from '../contracts/input'
import { CameraInput } from './camera-input'
import { drawHands, syncCanvas } from './demo-draw'
import { FixtureRecorder, recordVideo, VIDEO_RECORD_MS } from './demo-record'
import { DemoView } from './demo-view'
import type { OutEvent } from './pipeline'
import './demo.css'

/** Демо S1: видео со скелетом, прицел, closure с порогами, состояние, лог, FPS, калибровка, запись. */

const LOGGED: readonly InputEventType[] = ['grab', 'release', 'throw', 'point', 'zoom', 'handlost', 'hint']
const MS_PER_S = 1000
const COUNTDOWN_MS = 250

const root = document.getElementById('app')
if (!root) throw new Error('motion.html needs #app')
const view = new DemoView(root)
const input = new CameraInput({ video: view.video })

let pending: OutEvent[] = []
let fixture: FixtureRecorder | undefined

const describe = <K extends InputEventType>(type: K, e: InputEventMap[K]): string => {
  const r = (v: number): string => v.toFixed(2)
  if ('factor' in e) return `zoom ×${e.factor.toFixed(3)}`
  if ('code' in e) return `hint ${e.code}: ${e.message}`
  if ('vx' in e) return `${type} ${e.hand} (${r(e.x)}, ${r(e.y)}) v=(${r(e.vx)}, ${r(e.vy)})`
  if ('x' in e) return `${type} ${e.hand} (${r(e.x)}, ${r(e.y)})`
  return `${type} ${'hand' in e ? e.hand : ''}`
}

LOGGED.forEach((type) =>
  input.on(type, (e) => {
    view.log(describe(type, e))
    pending.push({ type, e } as OutEvent)
    if (type === 'hint') view.toast(e as InputEventMap['hint'])
  }),
)
input.on('cursor', (e) => pending.push({ type: 'cursor', e }))

input.onFrame((info) => {
  const ctx = syncCanvas(view.canvas, view.video)
  if (ctx) drawHands(ctx, info.hands)
  view.renderFrame(info)
  fixture?.push(info.t, info.raw, pending)
  pending = []
})

const buttons = {
  start: view.action('start'),
  calibrate: view.action('calibrate'),
  record: view.action('record'),
  frames: view.action('frames'),
}
const gesture = view.action<HTMLSelectElement>('gesture')

buttons.start.addEventListener('click', async () => {
  buttons.start.disabled = true
  view.setEmpty('Загружаю модель и включаю камеру…')
  try {
    await input.start()
    view.setEmpty(undefined)
    buttons.start.textContent = 'Камера включена'
    ;[buttons.calibrate, buttons.record, buttons.frames].forEach((b) => (b.disabled = false))
  } catch (err) {
    view.setEmpty(err instanceof Error ? err.message : String(err))
    buttons.start.disabled = false
  }
})

buttons.calibrate.addEventListener('click', async () => {
  buttons.calibrate.disabled = true
  try {
    const r = await input.calibrate((p) => view.showCalibration(p.prompt, p.progress))
    view.log(`калибровка: ладонь ${r.openValue.toFixed(2)}, кулак ${r.fistValue.toFixed(2)}`)
  } catch (err) {
    view.log(err instanceof Error ? err.message : String(err))
  } finally {
    setTimeout(() => view.showCalibration(undefined), MS_PER_S)
    buttons.calibrate.disabled = false
  }
})

buttons.record.addEventListener('click', () => {
  const stream = input.stream
  if (!stream) return
  buttons.record.disabled = true
  const until = performance.now() + VIDEO_RECORD_MS
  const timer = setInterval(() => {
    buttons.record.textContent = `Запись… ${Math.ceil((until - performance.now()) / MS_PER_S)} с`
  }, COUNTDOWN_MS)
  recordVideo(stream, () => {
    clearInterval(timer)
    buttons.record.textContent = 'Записать 30 секунд'
    buttons.record.disabled = false
    view.log('видео сохранено, конвертация: ffmpeg -i gestures.webm -pix_fmt yuv420p test-assets/gestures.y4m')
  })
})

buttons.frames.addEventListener('click', () => {
  if (!fixture) {
    fixture = new FixtureRecorder()
    buttons.frames.textContent = 'Остановить и скачать'
    view.log(`запись кадров: ${gesture.value}`)
    return
  }
  const rec = fixture
  fixture = undefined
  rec.save(gesture.value, input.thresholds)
  buttons.frames.textContent = 'Сохранить кадры'
  view.log(`сохранено кадров: ${rec.size}, положи файл в test-assets/fixtures/`)
})

window.addEventListener('beforeunload', () => input.stop())
