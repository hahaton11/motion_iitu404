/** Над каким стикером показать подсказку «как продиктовать». Чистая логика без DOM. */

export interface TipScene {
  /** Стикеры под прицелами рук, по одному на руку. */
  readonly hovered: readonly string[]
  readonly selectedId?: string
  /** Элемент в руке: пока что-то несут, подсказка не мешает. */
  readonly heldId?: string
  /** Стикер, в который уже идёт запись: над ним своя плашка «Говори». */
  readonly recordingId?: string
}

/** Наведённый стикер важнее выделенного: человек смотрит туда, куда целится. */
export function tipTarget(s: TipScene): string | undefined {
  if (s.heldId !== undefined || s.recordingId !== undefined) return undefined
  return s.hovered[0] ?? s.selectedId
}
