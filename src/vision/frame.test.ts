import { describe, expect, it } from 'vitest'
import { frameBox } from './frame'

describe('frameBox', () => {
  it('centres a square window on the object, about 2.4× its size', () => {
    // A 200×100 object in the middle of a 2000×1000 photo.
    const { window, object } = frameBox([450, 450, 550, 550], 2000, 1000)
    expect(window.width).toBe(480)
    expect(window.height).toBe(480)
    expect(window.x + window.width / 2).toBeCloseTo(1000)
    expect(window.y + window.height / 2).toBeCloseTo(500)
    expect(object).toEqual({ x: 140, y: 190, width: 200, height: 100 })
  })

  it('never makes a tiny object’s window smaller than 35% of the short side', () => {
    const { window } = frameBox([500, 500, 510, 505], 2000, 1000)
    expect(window.width).toBe(350)
  })

  it('caps the window at the photo’s short side', () => {
    const { window } = frameBox([100, 100, 900, 900], 2000, 1000)
    expect(window.width).toBe(1000)
  })

  it('moves the window inside the photo near an edge; the object then sits off-centre', () => {
    const { window, object } = frameBox([0, 0, 100, 50], 2000, 1000)
    expect(window).toMatchObject({ x: 0, y: 0, width: 350 })
    expect(object).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  it('keeps the object rectangle inside the window for a very large object', () => {
    const { window, object } = frameBox([0, 0, 1000, 1000], 2000, 1000)
    expect(window.width).toBe(1000)
    expect(object.width).toBeLessThanOrEqual(window.width)
    expect(object.x).toBeGreaterThanOrEqual(0)
  })
})
