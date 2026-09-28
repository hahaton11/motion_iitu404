import { PALETTE } from '../board/model'
import { makeItem, type PocketContent, type PocketItem } from './model'

/** Картинка-заготовка лежит в public/presets и берётся относительно base, чтобы работать на GitHub Pages. */
export const PRESET_IMAGE_URL = `${import.meta.env.BASE_URL}presets/idea.svg`

const DEFAULT_CONTENT: readonly PocketContent[] = [
  { kind: 'sticky', text: 'Голосовать за идеи поднятой рукой', color: PALETTE.sticky[0] },
  { kind: 'sticky', text: 'Что, если убрать мышь совсем?', color: PALETTE.sticky[1] },
  { kind: 'sticky', text: 'Карта пути пользователя', color: PALETTE.sticky[2] },
  { kind: 'sticky', text: 'Прототип за один вечер', color: PALETTE.sticky[3] },
  { kind: 'circle', color: PALETTE.circle[0] },
  { kind: 'rect', color: PALETTE.rect[1] },
  { kind: 'image', src: PRESET_IMAGE_URL, w: 240, h: 180 },
]

/** Заготовки первого запуска: 4 стикера, 2 фигуры, 1 картинка. createdAt убывает, чтобы порядок сохранился. */
export function defaultItems(now: number): readonly PocketItem[] {
  return DEFAULT_CONTENT.map((content, i) => makeItem(`preset-default-${i}`, 'preset', content, now - i))
}
