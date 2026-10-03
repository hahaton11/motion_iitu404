import type { Board } from '../board'
import type { HintEvt, InputSource, PointEvt } from '../contracts/input'
import { TypedEmitter, type Unsubscribe } from '../pocket/emitter'
import { VoiceIndicator } from './indicator'
import { VoiceTip } from './tip'
import { speechSupported, startSpeech, type SpeechErrorCode, type SpeechSession } from './speech'
import { collect, POINT_GUARD_MS, STOP_TIMEOUT_MS, stickyText, stopAt, type Transcript } from './transcript'

export const VOICE_HINTS = {
  UNSUPPORTED: {
    code: 'VOICE_UNSUPPORTED',
    message: 'Голосовой ввод работает в Chrome, текст можно положить в карман заранее',
    severity: 'info',
  },
  DENIED: {
    code: 'VOICE_DENIED',
    message: 'Разреши доступ к микрофону в адресной строке, чтобы диктовать',
    severity: 'warn',
  },
  NO_SPEECH: { code: 'VOICE_NO_SPEECH', message: 'Говори громче и ближе к микрофону', severity: 'info' },
  NETWORK: {
    code: 'VOICE_NETWORK',
    message: 'Проверь интернет: распознавание речи в Chrome идёт через сеть',
    severity: 'warn',
  },
  AUDIO: { code: 'VOICE_AUDIO', message: 'Подключи микрофон и выбери его в настройках браузера', severity: 'warn' },
} as const satisfies Record<string, HintEvt>

const ERROR_HINTS: Readonly<Record<SpeechErrorCode, HintEvt | undefined>> = {
  denied: VOICE_HINTS.DENIED,
  'no-speech': VOICE_HINTS.NO_SPEECH,
  network: VOICE_HINTS.NETWORK,
  audio: VOICE_HINTS.AUDIO,
  other: undefined,
}

/** Подсказка по умолчанию: диктовка начинается тем же жестом, что выделяет стикер. */
export const DEFAULT_VOICE_TIP = 'Укажи пальцем на стикер и задержи — потом говори текст'

export interface VoiceOptions {
  /** Текст подсказки под наведённым или выделенным стикером: зависит от режима ввода и микрофона. */
  readonly tip?: () => string
}

export interface VoiceEventMap {
  start: { readonly id: string }
  interim: { readonly id: string; readonly text: string }
  /** Текст записан в стикер. */
  final: { readonly id: string; readonly text: string }
  end: { readonly id: string }
  error: { readonly id: string; readonly code: SpeechErrorCode }
}

export interface Voice {
  /** Есть ли Web Speech API в этом браузере. */
  readonly supported: boolean
  /** id стикера, в который идёт запись. */
  recordingId(): string | undefined
  /** Начать диктовку в стикер. Если API нет, показывает подсказку. */
  start(id: string): void
  /** Закончить диктовку и записать текст. */
  stop(): void
  /** Прервать без записи. */
  cancel(): void
  on<K extends keyof VoiceEventMap>(type: K, fn: (e: VoiceEventMap[K]) => void): Unsubscribe
  destroy(): void
}

interface Recording {
  readonly id: string
  readonly session: SpeechSession
  readonly startedAt: number
  readonly lastSpeechAt?: number
  readonly transcript: Transcript
  readonly stopping: boolean
}

/**
 * Голосовой ввод: point на стикере начинает запись, пауза 1,5 с или повторный point заканчивает.
 * Выделение доски приходит через board.on('select'); повторный point по уже выделенному стикеру
 * доска не сообщает, поэтому для него нужен input.
 */
export class VoiceController implements Voice {
  readonly supported = speechSupported()
  private rec: Recording | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly indicator: VoiceIndicator
  private readonly tip: VoiceTip
  private readonly events = new TypedEmitter<VoiceEventMap>()
  private readonly disposers: Unsubscribe[] = []

  constructor(private readonly board: Board, input?: InputSource, opts: VoiceOptions = {}) {
    this.indicator = new VoiceIndicator(board)
    this.tip = new VoiceTip(board, input, opts.tip ?? (() => DEFAULT_VOICE_TIP))
    this.disposers.push(
      this.events.on('start', ({ id }) => this.tip.setRecording(id)),
      this.events.on('end', () => this.tip.setRecording(undefined)),
    )
    this.disposers.push(
      board.on('select', ({ id }) => this.onSelect(id)),
      board.on('remove', ({ element }) => element.id === this.rec?.id && this.cancel()),
    )
    if (input) this.disposers.push(input.on('point', (e) => this.onPoint(e)))
  }

  recordingId(): string | undefined {
    return this.rec?.id
  }

  start(id: string): void {
    if (this.rec?.id === id) return
    this.flush()
    if (!this.isSticky(id)) return
    if (!this.supported) {
      this.board.emitHint(VOICE_HINTS.UNSUPPORTED)
      return
    }
    const session = startSpeech({
      onResult: (chunks) => this.onResult(id, collect(chunks)),
      onError: (code) => this.onError(id, code),
      onEnd: () => this.finish(id),
    })
    if (!session) {
      this.board.emitHint(VOICE_HINTS.UNSUPPORTED)
      return
    }
    this.rec = { id, session, startedAt: performance.now(), transcript: { final: '', interim: '' }, stopping: false }
    this.indicator.show(id)
    this.schedule()
    this.events.emit('start', { id })
  }

  stop(): void {
    const rec = this.rec
    if (!rec || rec.stopping) return
    this.rec = { ...rec, stopping: true }
    rec.session.stop()
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.finish(rec.id), STOP_TIMEOUT_MS)
  }

  cancel(): void {
    const rec = this.rec
    if (!rec) return
    this.rec = undefined
    clearTimeout(this.timer)
    rec.session.abort()
    this.indicator.hide()
    this.events.emit('end', { id: rec.id })
  }

  on<K extends keyof VoiceEventMap>(type: K, fn: (e: VoiceEventMap[K]) => void): Unsubscribe {
    return this.events.on(type, fn)
  }

  destroy(): void {
    this.cancel()
    this.disposers.splice(0).forEach((d) => d())
    this.indicator.destroy()
    this.tip.destroy()
    this.events.clear()
  }

  private isSticky(id: string): boolean {
    return this.board.getElement(id)?.kind === 'sticky'
  }

  private onSelect(id: string | undefined): void {
    if (this.rec && this.rec.id !== id) this.flush()
    if (id && this.isSticky(id)) this.start(id)
  }

  /** Закончить текущую запись сразу, с тем текстом, что уже распознан. */
  private flush(): void {
    const rec = this.rec
    if (!rec) return
    rec.session.abort()
    this.finish(rec.id)
  }

  /** Повторный point по стикеру: остановить запись или начать новую по уже выделенному. */
  private onPoint(e: PointEvt): void {
    const hit = this.board.elementAt(e.x, e.y)
    if (!hit || hit.kind !== 'sticky') return
    const rec = this.rec
    if (rec?.id === hit.id) {
      if (performance.now() - rec.startedAt >= POINT_GUARD_MS) this.stop()
      return
    }
    if (!rec && hit.id === this.board.getState().selectedId) this.start(hit.id)
  }

  private onResult(id: string, transcript: Transcript): void {
    const rec = this.rec
    if (rec?.id !== id) return
    this.rec = { ...rec, transcript, lastSpeechAt: performance.now() }
    const text = stickyText(transcript)
    this.indicator.setInterim(text)
    this.events.emit('interim', { id, text })
    if (!rec.stopping) this.schedule()
  }

  private onError(id: string, code: SpeechErrorCode): void {
    if (this.rec?.id !== id) return
    const hint = ERROR_HINTS[code]
    if (hint) this.board.emitHint(hint)
    this.events.emit('error', { id, code })
  }

  /** Таймер окончания: пауза после последней речи или таймаут, если никто не заговорил. */
  private schedule(): void {
    const rec = this.rec
    if (!rec) return
    clearTimeout(this.timer)
    const wait = stopAt(rec.startedAt, rec.lastSpeechAt) - performance.now()
    this.timer = setTimeout(() => this.stop(), Math.max(0, wait))
  }

  private finish(id: string): void {
    const rec = this.rec
    if (rec?.id !== id) return
    this.rec = undefined
    clearTimeout(this.timer)
    this.indicator.hide()
    const text = stickyText(rec.transcript)
    if (text && this.board.getElement(id)) {
      this.board.updateElement(id, { text })
      this.events.emit('final', { id, text })
    }
    this.events.emit('end', { id })
  }
}
