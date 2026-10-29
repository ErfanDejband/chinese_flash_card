import { describe, expect, it } from 'vitest'
import type { NormBox } from '@/import/types'
import { decodeDetections, defaultBoxAt, type Detection, iou, padBox, pickAt, suggestObjects, visibleDetections } from './detections'

const logit = (p: number) => Math.log(p / (1 - p))

describe('decodeDetections', () => {
  it('takes each query’s best real class by sigmoid, skips class 0, and converts boxes to 0-1000', () => {
    // 2 queries × 3 classes (0 = "None"): query 0 is a cup at 0.9, query 1 a chair at 0.3 even though "None" is higher.
    const logits = [5, logit(0.9), logit(0.2), 9, logit(0.1), logit(0.3)]
    const boxes = [0.5, 0.5, 0.2, 0.4, 0.25, 0.75, 0.1, 0.1]
    const labels = ['None', 'Cup', 'Chair']
    const out = decodeDetections(logits, boxes, 2, 3, (c) => labels[c]!)
    expect(out.map((d) => d.label)).toEqual(['Cup', 'Chair'])
    expect(out[0]!.score).toBeCloseTo(0.9)
    expect(out[0]!.box).toEqual([300, 400, 700, 600])
    expect(out[1]!.box).toEqual([700, 200, 800, 300])
  })

  it('clamps boxes to the photo and drops empty ones', () => {
    const out = decodeDetections([0, 1, 0, 1], [0.05, 0.5, 0.2, 0.2, 0.5, 0.5, 0, 0.3], 2, 2, () => 'Thing')
    expect(out).toHaveLength(1)
    expect(out[0]!.box).toEqual([400, 0, 600, 150])
  })
})

const det = (box: NormBox, score: number, label = 'Thing'): Detection => ({ box, score, label })

describe('visibleDetections', () => {
  it('keeps strong candidates, best first, without near-duplicates', () => {
    const all = [det([100, 100, 400, 400], 0.9, 'Cup'), det([105, 100, 400, 405], 0.8, 'Mug'), det([500, 500, 900, 900], 0.6), det([0, 0, 100, 100], 0.2)]
    expect(visibleDetections(all, 0.5).map((d) => d.score)).toEqual([0.9, 0.6])
    expect(visibleDetections(all, 0.1, 1)).toHaveLength(1)
  })
})

describe('pickAt', () => {
  const desk = det([400, 0, 1000, 1000], 0.8, 'Desk')
  const cup = det([450, 450, 550, 550], 0.5, 'Cup')
  const faint = det([450, 450, 550, 550], 0.08, 'Faint') // junk: what a blank wall scores

  it('prefers the smallest box under the finger among the likely ones', () => {
    expect(pickAt([desk, cup], 500, 500)?.label).toBe('Cup')
    expect(pickAt([desk, cup], 100, 900)?.label).toBe('Desk')
  })

  it('can leave out big boxes', () => {
    expect(pickAt([desk], 100, 900, undefined, 0.35)).toBeUndefined()
  })

  it('ignores much weaker boxes and empty spots', () => {
    expect(pickAt([desk, det([450, 450, 550, 550], 0.1)], 500, 500)?.label).toBe('Desk')
    expect(pickAt([faint], 500, 500)).toBeUndefined()
    expect(pickAt([cup], 50, 50)).toBeUndefined()
  })
})

describe('suggestObjects', () => {
  it('merges overlapping boxes across labels and keeps nested different things', () => {
    const all = [
      det([400, 0, 1000, 1000], 0.9, 'Desk'),
      det([450, 450, 550, 560], 0.8, 'Mouse'),
      det([455, 455, 555, 565], 0.6, 'Remote'), // the same controller, another guess
      det([440, 440, 540, 530], 0.5, 'Glasses'), // mostly inside the controller box, similar size
      det([600, 100, 700, 200], 0.4, 'Cup'), // on the desk: kept
      det([0, 0, 300, 300], 0.7, 'Person'),
      det([800, 800, 850, 850], 0.1, 'Pen'), // too weak
    ]
    const { small, big } = suggestObjects(all)
    expect(small.map((d) => d.label)).toEqual(['Mouse', 'Cup'])
    expect(big.map((d) => d.label)).toEqual(['Desk'])
  })

  it('keeps at most `max` small suggestions, best first', () => {
    const all = Array.from({ length: 20 }, (_, i) => det([i * 40, 0, i * 40 + 30, 30], 0.9 - i * 0.01))
    expect(suggestObjects(all, { max: 5 }).small).toHaveLength(5)
    expect(suggestObjects(all, { max: 5 }).small[0]!.score).toBeCloseTo(0.9)
  })
})

describe('defaultBoxAt', () => {
  it('makes a box square in pixels around the tap', () => {
    expect(defaultBoxAt(500, 500)).toEqual([390, 390, 610, 610])
    // A portrait photo (3:4): the box is narrower in height units.
    expect(defaultBoxAt(500, 500, 0.75)).toEqual([418, 390, 583, 610])
    // A landscape photo (4:3).
    expect(defaultBoxAt(500, 500, 4 / 3)).toEqual([390, 418, 610, 583])
  })

  it('moves the box inside the photo near an edge', () => {
    expect(defaultBoxAt(10, 990)).toEqual([780, 0, 1000, 220])
  })
})

describe('padBox and iou', () => {
  it('grows a box by a share of its size, within the photo', () => {
    expect(padBox([100, 200, 300, 600], 0.25)).toEqual([50, 100, 350, 700])
    expect(padBox([0, 900, 100, 1000])).toEqual([0, 880, 120, 1000])
  })

  it('measures overlap', () => {
    expect(iou([0, 0, 100, 100], [0, 0, 100, 100])).toBe(1)
    expect(iou([0, 0, 100, 100], [0, 50, 100, 150])).toBeCloseTo(1 / 3)
    expect(iou([0, 0, 100, 100], [200, 200, 300, 300])).toBe(0)
  })
})
