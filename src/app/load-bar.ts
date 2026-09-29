import { formatMb, type LoadProgress } from '../motion'
import { el } from './dom'

/**
 * Полоса загрузки распознавания. До первого кадра качается около 22 МБ, и без неё
 * первое, что видит человек, — неподвижный экран без единого признака работы.
 */

export interface LoadBar {
  readonly node: HTMLElement
  /** `undefined` — скрыть: загрузка либо не идёт, либо уже ни при чём. */
  update(p: LoadProgress | undefined): void
}

const LABEL_DONE = 'Запускаю распознавание…'

export function loadBar(): LoadBar {
  const bar = el('div', 'app-bar')
  bar.append(el('div', 'app-bar-fill'))
  bar.setAttribute('role', 'progressbar')
  bar.setAttribute('aria-valuemin', '0')
  bar.setAttribute('aria-valuemax', '100')
  const label = el('p', 'app-caption app-load-label')
  const node = el('div', 'app-load', bar, label)
  const update = (p: LoadProgress | undefined): void => {
    node.hidden = p === undefined
    if (!p) return
    bar.style.setProperty('--p', String(p.ratio))
    bar.setAttribute('aria-valuenow', String(Math.round(p.ratio * 100)))
    bar.classList.toggle('is-waiting', p.done)
    label.textContent = p.done ? LABEL_DONE : `${formatMb(p.loadedBytes)} из ${formatMb(p.totalBytes)} МБ`
  }
  update(undefined)
  return { node, update }
}
