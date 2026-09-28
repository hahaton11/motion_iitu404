import { describe, expect, it } from 'vitest'
import { fitImage, IMAGE_BOX_H, IMAGE_BOX_W } from './image'

describe('fitImage', () => {
  it('fits a wide image by width and a tall one by height', () => {
    expect(fitImage(1000, 500)).toEqual({ w: IMAGE_BOX_W, h: 130 })
    expect(fitImage(400, 800)).toEqual({ w: 110, h: IMAGE_BOX_H })
  })

  it('falls back to the box for broken sizes', () => {
    expect(fitImage(0, 10)).toEqual({ w: IMAGE_BOX_W, h: IMAGE_BOX_H })
  })
})
