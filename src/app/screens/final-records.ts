import { formatTime } from '../challenge'
import type { AppContext } from '../context'
import { el, text } from '../dom'
import {
  addRecord,
  loadRecords,
  nicknameOptions,
  renameRecord,
  saveRecords,
  type GameRecord,
} from '../records'
import { listenName, nameVoiceSupported } from '../voice-name'

/** Блок рекордов финала: таблица из localStorage и выбор имени прозвищем или голосом. */

export interface RecordsBlock {
  readonly node: HTMLElement
  destroy(): void
}

function table(list: readonly GameRecord[], currentId: string): HTMLElement {
  const rows = list.map((r, i) => {
    const tr = el(
      'tr',
      r.id === currentId ? 'is-current' : '',
      text('td', 'app-rec-rank', String(i + 1)),
      text('td', 'app-rec-name', r.name),
      text('td', '', `${r.accuracy}%`),
      text('td', '', formatTime(r.timeMs)),
      text('td', 'app-rec-score', String(r.score)),
    )
    return tr
  })
  const head = el('tr', '', ...['#', 'Имя', 'Точность', 'Время', 'Очки'].map((h) => text('th', '', h)))
  return el('table', 'app-rec-table', el('thead', '', head), el('tbody', '', ...rows))
}

export function recordsBlock(ctx: AppContext, record: GameRecord): RecordsBlock {
  const added = addRecord(loadRecords(ctx.store), record)
  let list = added.list
  saveRecords(ctx.store, list)
  let cancelVoice: (() => void) | undefined
  const tableSlot = el('div', 'app-rec-slot')
  const status = el('p', 'app-caption')
  const rankText = added.rank ? `Ты на ${added.rank} месте` : 'До таблицы чуть-чуть не хватило'
  const rename = (name: string) => {
    list = renameRecord(list, record.id, name)
    saveRecords(ctx.store, list)
    tableSlot.replaceChildren(table(list, record.id))
    status.textContent = `Записал как «${list.find((r) => r.id === record.id)?.name ?? name}»`
  }
  const nicks = nicknameOptions(record.at).map((nick) =>
    ctx.buttons.create({ label: nick, variant: 'small', onPress: () => rename(nick) }),
  )
  const voice = ctx.buttons.create({
    label: 'Сказать имя',
    variant: 'small',
    icon: 'voice',
    onPress: () => {
      cancelVoice?.()
      status.textContent = 'Говори имя, я слушаю'
      const job = listenName()
      cancelVoice = job.cancel
      job.result.then(rename).catch((err: unknown) => (status.textContent = err instanceof Error ? err.message : ''))
    },
  })
  voice.hidden = !nameVoiceSupported()
  const picker = el('div', 'app-row app-nicks', ...nicks, voice)
  tableSlot.append(table(list, record.id))
  const canPick = added.rank !== undefined
  picker.hidden = !canPick
  const node = el(
    'div',
    'app-records',
    text('h3', 'app-sub', `Рекорды · ${rankText}`),
    ...(canPick ? [text('p', 'app-caption', 'Как тебя записать? Выбери прозвище курсором или скажи имя')] : []),
    picker,
    status,
    tableSlot,
  )
  return { node, destroy: () => cancelVoice?.() }
}
