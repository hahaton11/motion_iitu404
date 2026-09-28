import { rect, type Placed, type WorldRect } from './zones'

/** Чистая часть экспорта PNG: границы содержимого, масштаб холста, перенос текста. */

export const EXPORT_PAD = 60
export const EXPORT_MAX_PX = 2400
export const EXPORT_SCALE = 2

/** Прямоугольник, описанный вокруг всех элементов и зон, с полями. Пустая доска — квадрат вокруг нуля. */
export function contentBounds(elements: readonly Placed[], zones: readonly WorldRect[], pad = EXPORT_PAD): WorldRect {
  const boxes = [
    ...elements.map((e) => rect(e.x - e.w / 2, e.y - e.h / 2, e.x + e.w / 2, e.y + e.h / 2)),
    ...zones,
  ]
  if (boxes.length === 0) return rect(-400 - pad, -300 - pad, 400 + pad, 300 + pad)
  return rect(
    Math.min(...boxes.map((b) => b.left)) - pad,
    Math.min(...boxes.map((b) => b.top)) - pad,
    Math.max(...boxes.map((b) => b.right)) + pad,
    Math.max(...boxes.map((b) => b.bottom)) + pad,
  )
}

/** Масштаб мира в пиксели холста: чётко, но не больше предела по длинной стороне. */
export function exportScale(bounds: WorldRect, maxPx = EXPORT_MAX_PX, scale = EXPORT_SCALE): number {
  const longest = Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top)
  return Math.min(scale, maxPx / Math.max(1, longest))
}

/** Перенос по словам; слово длиннее строки режется по буквам. Не больше maxLines, остаток с многоточием. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number, maxLines = 6): readonly string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  const push = (w: string) => {
    const next = line ? `${line} ${w}` : w
    if (measure(next) <= maxWidth || !line) line = next
    else {
      lines.push(line)
      line = w
    }
  }
  words.forEach((w) => splitLong(w, maxWidth, measure).forEach(push))
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = `${kept[maxLines - 1] ?? ''}…`
  return kept
}

function splitLong(word: string, maxWidth: number, measure: (s: string) => number): readonly string[] {
  if (measure(word) <= maxWidth) return [word]
  const parts: string[] = []
  let cur = ''
  for (const ch of word) {
    if (cur && measure(cur + ch) > maxWidth) {
      parts.push(cur)
      cur = ch
    } else cur += ch
  }
  if (cur) parts.push(cur)
  return parts
}

/** Имя файла экспорта по дате: motion-board-2026-09-30-1415.png. */
export function exportFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `motion-board-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.png`
}
