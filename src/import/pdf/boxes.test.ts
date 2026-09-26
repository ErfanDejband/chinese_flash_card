import { describe, expect, it } from 'vitest'
import { boxToPageUnits, boxToPixels, pixelsToBox } from './boxes'

describe('boxToPixels', () => {
  it('scales, pads and clamps', () => {
    // 0–1000 box covering the middle half of a 2000 × 1000 image, 10 % padding
    expect(boxToPixels([250, 250, 750, 750], 2000, 1000, 0.1)).toEqual({ x: 400, y: 200, width: 1200, height: 600 })
    // padding cannot leave the image
    expect(boxToPixels([0, 0, 1000, 1000], 100, 100, 0.1)).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  it('rejects tiny boxes', () => {
    expect(boxToPixels([500, 500, 510, 800], 1000, 1000)).toBeNull()
  })
})

describe('boxToPageUnits / pixelsToBox', () => {
  it('converts to PDF points', () => {
    expect(boxToPageUnits([100, 200, 600, 700], 960, 540)).toEqual({ x: 192, y: 54, width: 480, height: 270 })
  })

  it('round-trips a drawn rectangle', () => {
    expect(pixelsToBox({ x: 400, y: 200, width: 1200, height: 600 }, 2000, 1000)).toEqual([200, 200, 800, 800])
  })
})
