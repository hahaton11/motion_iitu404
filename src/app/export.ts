import type { BoardElement, BoardState } from '../board'
import { contentBounds, exportFileName, exportScale, wrapText } from './export-layout'
import type { WorldRect } from './zones'

/**
 * Экспорт доски в PNG без библиотек: состояние доски рисуется в canvas заново,
 * в цветах темы доски. Зоны челленджа рисуются подписанными рамками под элементами.
 */

export interface ExportZone {
  readonly rect: WorldRect
  readonly title: string
  readonly tone: 'accent' | 'danger'
}

const BG = '#06090f'
const DOT = 'rgba(150, 185, 230, 0.2)'
const FG = '#e6edf7'
const ACCENT = '#5ad1ff'
const DANGER = '#ff8a7a'
const STICKY_TEXT = '#1b1f2a'
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const GRID = 32
const TEXT_SIZE = 19
const TEXT_PAD = 14
const IMAGE_TIMEOUT_MS = 3000

function loadImage(src: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => resolve(undefined), IMAGE_TIMEOUT_MS)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(undefined)
    }
    img.src = src
  })
}

function drawGrid(ctx: CanvasRenderingContext2D, b: WorldRect): void {
  ctx.fillStyle = BG
  ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top)
  ctx.fillStyle = DOT
  const x0 = Math.floor(b.left / GRID) * GRID
  const y0 = Math.floor(b.top / GRID) * GRID
  for (let x = x0; x < b.right; x += GRID) {
    for (let y = y0; y < b.bottom; y += GRID) ctx.fillRect(x, y, 2.4, 2.4)
  }
}

function drawZone(ctx: CanvasRenderingContext2D, z: ExportZone): void {
  const color = z.tone === 'danger' ? DANGER : ACCENT
  const { left, top, right, bottom } = z.rect
  ctx.save()
  ctx.setLineDash([14, 10])
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.7
  ctx.beginPath()
  ctx.roundRect(left, top, right - left, bottom - top, 22)
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = color
  ctx.font = `700 24px ${FONT}`
  ctx.textBaseline = 'top'
  ctx.fillText(z.title, left + 20, top + 16)
  ctx.restore()
}

function shapePath(ctx: CanvasRenderingContext2D, el: BoardElement): void {
  const hw = el.w / 2
  const hh = el.h / 2
  ctx.beginPath()
  if (el.kind === 'circle') ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2)
  else if (el.kind === 'triangle') {
    ctx.moveTo(0, -hh)
    ctx.lineTo(hw, hh)
    ctx.lineTo(-hw, hh)
    ctx.closePath()
  } else if (el.kind === 'sticky') ctx.roundRect(-hw, -hh, el.w, el.h, [6, 6, 18, 6])
  else ctx.roundRect(-hw, -hh, el.w, el.h, el.kind === 'image' ? 10 : 12)
}

function drawText(ctx: CanvasRenderingContext2D, el: BoardElement, color: string): void {
  if (!el.text) return
  ctx.fillStyle = color
  ctx.font = `600 ${TEXT_SIZE}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lines = wrapText(el.text, el.w - TEXT_PAD * 2, (s) => ctx.measureText(s).width)
  const lh = TEXT_SIZE * 1.25
  const y0 = -((lines.length - 1) * lh) / 2 + (el.kind === 'triangle' ? el.h * 0.2 : 0)
  lines.forEach((line, i) => ctx.fillText(line, 0, y0 + i * lh))
}

function drawElement(ctx: CanvasRenderingContext2D, el: BoardElement, img: HTMLImageElement | undefined): void {
  ctx.save()
  ctx.translate(el.x, el.y)
  ctx.rotate((el.rotation * Math.PI) / 180)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
  ctx.shadowBlur = 16
  ctx.shadowOffsetY = 6
  shapePath(ctx, el)
  if (el.kind === 'sticky') {
    ctx.fillStyle = el.color
    ctx.fill()
  } else if (el.kind === 'image') {
    ctx.fillStyle = '#0c1320'
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.clip()
    if (img) ctx.drawImage(img, -el.w / 2, -el.h / 2, el.w, el.h)
  } else {
    ctx.fillStyle = `${el.color}33`
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.lineWidth = 2
    ctx.strokeStyle = el.color
    ctx.stroke()
  }
  ctx.shadowColor = 'transparent'
  drawText(ctx, el, el.kind === 'sticky' ? STICKY_TEXT : FG)
  ctx.restore()
}

/** Рисует доску в canvas. Картинки грузятся заранее, битые пропускаются. */
export async function renderBoard(state: BoardState, zones: readonly ExportZone[] = []): Promise<HTMLCanvasElement> {
  const elements = [...state.elements].sort((a, b) => a.z - b.z)
  const bounds = contentBounds(elements, zones.map((z) => z.rect))
  const scale = exportScale(bounds)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round((bounds.right - bounds.left) * scale)
  canvas.height = Math.round((bounds.bottom - bounds.top) * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступен, обнови браузер, чтобы сохранить PNG')
  const images = await Promise.all(elements.map((el) => (el.kind === 'image' && el.src ? loadImage(el.src) : undefined)))
  ctx.scale(scale, scale)
  ctx.translate(-bounds.left, -bounds.top)
  drawGrid(ctx, bounds)
  zones.forEach((z) => drawZone(ctx, z))
  elements.forEach((el, i) => drawElement(ctx, el, images[i]))
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось собрать PNG, попробуй ещё раз'))), 'image/png'),
  )
}

/** Скачивание файла через временную ссылку. */
export function downloadBlob(blob: Blob, name = exportFileName(new Date())): void {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportPng(state: BoardState, zones: readonly ExportZone[] = []): Promise<void> {
  downloadBlob(await canvasToBlob(await renderBoard(state, zones)))
}
