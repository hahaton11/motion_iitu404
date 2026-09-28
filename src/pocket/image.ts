import type { PocketContent } from './model'

/** Картинка ужимается до этой стороны, чтобы IndexedDB и DOM не таскали мегабайты. */
export const IMAGE_MAX_SIDE_PX = 960
export const IMAGE_QUALITY = 0.86
/** Размер элемента-картинки на доске: вписывается в эти рамки с сохранением пропорций. */
export const IMAGE_BOX_W = 260
export const IMAGE_BOX_H = 220

/** Размер элемента под пропорции картинки. Чистая функция. */
export function fitImage(w: number, h: number): { readonly w: number; readonly h: number } {
  if (w <= 0 || h <= 0) return { w: IMAGE_BOX_W, h: IMAGE_BOX_H }
  const k = Math.min(IMAGE_BOX_W / w, IMAGE_BOX_H / h)
  return { w: Math.round(w * k), h: Math.round(h * k) }
}

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Empty file')))
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'))
    reader.readAsDataURL(file)
  })

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image decode failed'))
    img.src = src
  })

function downscale(img: HTMLImageElement, original: string, type: string): string {
  const k = Math.min(1, IMAGE_MAX_SIDE_PX / Math.max(img.naturalWidth, img.naturalHeight))
  if (k >= 1 || type === 'image/svg+xml' || type === 'image/gif') return original
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * k)
  canvas.height = Math.round(img.naturalHeight * k)
  const ctx = canvas.getContext('2d')
  if (!ctx) return original
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const out = type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', IMAGE_QUALITY)
  return out.length < original.length ? out : original
}

/** Файл картинки превращается в содержимое кармана: dataURL и размер под пропорции. */
export async function imageContent(file: Blob): Promise<PocketContent> {
  if (!file.type.startsWith('image/')) throw new Error(`Not an image: ${file.type}`)
  const original = await readAsDataUrl(file)
  const img = await loadImage(original)
  const src = downscale(img, original, file.type)
  return { kind: 'image', src, ...fitImage(img.naturalWidth, img.naturalHeight) }
}
