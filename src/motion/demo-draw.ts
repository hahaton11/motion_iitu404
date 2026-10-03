import { HandLandmarker } from '@mediapipe/tasks-vision'
import { isHoldingPhase } from './hand-state'
import type { HandDebug } from './pipeline'

/** Скелет руки поверх видео. Canvas зеркалится CSS вместе с видео, поэтому рисуем в координатах кадра. */

const COLORS = { left: '#b18cff', right: '#5ad1ff', holding: '#6be38f' } as const
const LINE_WIDTH = 3
const POINT_RADIUS = 4
const CENTER_RADIUS = 9

export function syncCanvas(canvas: HTMLCanvasElement, video: HTMLVideoElement): CanvasRenderingContext2D | null {
  if (video.videoWidth && canvas.width !== video.videoWidth) {
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
  }
  return canvas.getContext('2d')
}

export function drawHands(ctx: CanvasRenderingContext2D, hands: readonly HandDebug[]): void {
  const { width: w, height: h } = ctx.canvas
  ctx.clearRect(0, 0, w, h)
  hands.forEach((hand) => {
    const lm = hand.detection.landmarks
    const holding = isHoldingPhase(hand.phase)
    const color = holding ? COLORS.holding : COLORS[hand.hand]
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = LINE_WIDTH
    ctx.beginPath()
    HandLandmarker.HAND_CONNECTIONS.forEach(({ start, end }) => {
      const a = lm[start]
      const b = lm[end]
      if (!a || !b) return
      ctx.moveTo(a.x * w, a.y * h)
      ctx.lineTo(b.x * w, b.y * h)
    })
    ctx.stroke()
    lm.forEach((p) => {
      ctx.beginPath()
      ctx.arc(p.x * w, p.y * h, POINT_RADIUS, 0, Math.PI * 2)
      ctx.fill()
    })
    const c = hand.features.center
    ctx.beginPath()
    ctx.arc(c.x * w, c.y * h, CENTER_RADIUS, 0, Math.PI * 2)
    ctx.stroke()
  })
}
