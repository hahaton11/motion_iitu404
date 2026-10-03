import { CameraInput } from '../motion'
import { requestMicrophone, type MicAccess } from '../shared/microphone'
import { MouseInput } from '../shared/mouse-input'
import { AppCursor } from './app-cursor'
import type { AppContext, CameraStatus, ChallengeResult, ScreenHandle, ScreenMount } from './context'
import { el } from './dom'
import { initialFlow, isBoardScreen, modeFromQuery, nextFlow, type FlowEvent, type FlowState, type Screen } from './flow'
import { GestureButtons } from './gesture-button'
import { HintToaster } from './hint-view'
import { InputHub } from './input-hub'
import type { KeyValueStore } from './records'
import { mountCalibration } from './screens/calibration'
import { mountCamera } from './screens/camera'
import { mountChallenge } from './screens/challenge'
import { mountFinal } from './screens/final'
import { mountFree } from './screens/free'
import { mountStart } from './screens/start'
import { mountTutorial } from './screens/tutorial'
import { Sound } from './sound'

/** Приложение: один источник ввода через хаб, машина экранов и монтирование текущего экрана. */

const SCREENS: Readonly<Record<Screen, ScreenMount>> = {
  start: mountStart,
  camera: mountCamera,
  calibration: mountCalibration,
  tutorial: mountTutorial,
  challenge: mountChallenge,
  final: mountFinal,
  free: mountFree,
}

const memoryStore = (): KeyValueStore => {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

function browserStore(): KeyValueStore {
  try {
    return window.localStorage
  } catch {
    return memoryStore()
  }
}

export class App {
  private flowState: FlowState
  private screen: ScreenHandle | undefined
  private cam: CameraInput | undefined
  private camStatus: CameraStatus = { phase: 'off' }
  private mic: MicAccess = 'unknown'
  private readonly micListeners = new Set<(s: MicAccess) => void>()
  private result: ChallengeResult | undefined
  private readonly camListeners = new Set<(s: CameraStatus) => void>()
  private readonly hub = new InputHub()
  private readonly sound = new Sound()
  private readonly video: HTMLVideoElement
  private readonly ctx: AppContext
  private readonly corner: HTMLElement
  private readonly cursor: AppCursor

  constructor(root: HTMLElement) {
    this.flowState = initialFlow(modeFromQuery(location.search))
    const boardHost = el('div', 'app-board')
    const layer = el('div', 'app-layer')
    const overlay = el('div', 'app-overlay')
    this.video = Object.assign(el('video', 'app-cam'), { muted: true, playsInline: true, autoplay: true })
    this.corner = el('div', 'app-corner')
    root.append(boardHost, this.video, layer, this.corner, overlay)
    const buttons = new GestureButtons(this.hub.raw, () => this.sound.play('tick'))
    const hints = new HintToaster(overlay, this.hub.raw)
    this.cursor = new AppCursor(overlay, this.hub.raw)
    this.ctx = this.context(layer, boardHost, buttons, hints)
    this.buildCorner(buttons)
    this.unlockSoundOnGesture()
  }

  start(): void {
    if (this.flowState.mode === 'camera') this.startCamera()
    else this.switchToMouse()
    this.render()
  }

  private context(layer: HTMLElement, boardHost: HTMLElement, buttons: GestureButtons, hints: HintToaster): AppContext {
    return {
      layer,
      boardHost,
      hub: this.hub,
      buttons,
      sound: this.sound,
      hints,
      store: browserStore(),
      flow: () => this.flowState,
      send: (e) => queueMicrotask(() => this.send(e)),
      camera: () => this.cam,
      cameraStatus: () => this.camStatus,
      onCameraStatus: (fn) => {
        this.camListeners.add(fn)
        return () => this.camListeners.delete(fn)
      },
      startCamera: () => this.startCamera(),
      micAccess: () => this.mic,
      onMicAccess: (fn) => {
        this.micListeners.add(fn)
        return () => this.micListeners.delete(fn)
      },
      switchToMouse: () => this.switchToMouse(),
      lastResult: () => this.result,
      setLastResult: (r) => (this.result = r),
    }
  }

  private send(e: FlowEvent): void {
    const next = nextFlow(this.flowState, e)
    if (next === this.flowState) return
    const changed = next.screen !== this.flowState.screen
    this.flowState = next
    if (changed) this.render()
  }

  private render(): void {
    this.screen?.destroy()
    const screen = this.flowState.screen
    document.body.dataset.screen = screen
    document.body.dataset.mode = this.flowState.mode
    this.cursor.setEnabled(!isBoardScreen(screen))
    this.corner.classList.toggle('is-home', screen !== 'start')
    this.screen = SCREENS[screen](this.ctx)
  }

  private setCamStatus(s: CameraStatus): void {
    this.camStatus = s
    document.body.dataset.cam = s.phase
    this.camListeners.forEach((fn) => fn(s))
  }

  private setMic(s: MicAccess): void {
    if (s === this.mic) return
    this.mic = s
    document.body.dataset.mic = s
    this.micListeners.forEach((fn) => fn(s))
  }

  private startCamera(): void {
    if (this.cam && this.camStatus.phase !== 'failed') return
    const withMic = this.mic === 'unknown'
    if (withMic) this.setMic('asking')
    const cam = new CameraInput({
      video: this.video,
      withMic,
      onMicAccess: (access) => this.setMic(access),
      onLoadProgress: (progress) => this.cam === cam && this.camStatus.phase === 'loading' && this.setCamStatus({ phase: 'loading', progress }),
    })
    this.cam = cam
    this.hub.use(cam)
    this.setCamStatus({ phase: 'loading' })
    cam
      .start()
      .then(() => this.cam === cam && this.setCamStatus({ phase: 'ready' }))
      .catch((err: unknown) => {
        // Камера не открылась, и ответа про микрофон нет: спросим его отдельно, голос пригодится и с мышью.
        if (withMic && this.mic === 'asking') {
          this.setMic('unknown')
          this.askMicAlone()
        }
        if (this.cam !== cam) return
        const message = err instanceof Error ? err.message : 'Обнови страницу или включи режим мыши'
        this.setCamStatus({ phase: 'failed', message })
      })
  }

  private switchToMouse(): void {
    if (this.hub.current instanceof MouseInput) return
    this.cam = undefined
    const mouse = new MouseInput(window)
    this.hub.use(mouse)
    void mouse.start()
    this.setCamStatus({ phase: 'off' })
    this.askMicAlone()
  }

  /** Без камеры микрофон спрашивается отдельным окном, как только выбрана мышь. */
  private askMicAlone(): void {
    if (this.mic !== 'unknown') return
    this.setMic('asking')
    void requestMicrophone().then((access) => this.setMic(access))
  }

  private buildCorner(buttons: GestureButtons): void {
    const sound = buttons.create({ label: '', variant: 'small', icon: 'sound', className: 'app-sound', onPress: () => this.sound.setMuted(!this.sound.isMuted()) })
    const syncSound = (muted: boolean) => {
      sound.classList.toggle('is-muted', muted)
      sound.title = muted ? 'Включить звук' : 'Выключить звук'
      const label = sound.querySelector('.app-btn-label')
      if (label) label.textContent = muted ? 'Звук выкл' : 'Звук'
    }
    this.sound.onChange(syncSound)
    syncSound(this.sound.isMuted())
    const home = buttons.create({ label: 'В начало', variant: 'small', className: 'app-home', onPress: () => this.send({ type: 'home' }) })
    this.corner.append(sound, home)
  }

  /** Браузер разрешает звук только после жеста пользователя: ловим первый клик или клавишу. */
  private unlockSoundOnGesture(): void {
    const unlock = () => this.sound.unlock()
    window.addEventListener('pointerdown', unlock, { capture: true, once: true })
    window.addEventListener('keydown', unlock, { capture: true, once: true })
  }
}
