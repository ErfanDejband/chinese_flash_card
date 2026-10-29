import type { NormBox } from '@/import/types'

/** One candidate from the object detector: a box (0-1000, like every box in the app) and its best label. */
export interface Detection {
  box: NormBox
  label: string
  score: number
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))
const clamp = (v: number) => Math.min(1000, Math.max(0, Math.round(v * 1000)))

/**
 * D-FINE's raw outputs as one candidate per query, best first. Scores are per-class sigmoids (no
 * softmax, no "no object" class); class 0 ("None") is skipped. `boxes` holds normalised
 * (cx, cy, w, h) per query.
 */
export function decodeDetections(
  logits: ArrayLike<number>,
  boxes: ArrayLike<number>,
  queries: number,
  classes: number,
  labelOf: (cls: number) => string,
): Detection[] {
  const out: Detection[] = []
  for (let q = 0; q < queries; q++) {
    let best = 1
    for (let c = 2; c < classes; c++) if (logits[q * classes + c]! > logits[q * classes + best]!) best = c
    const [cx, cy, w, h] = [boxes[q * 4]!, boxes[q * 4 + 1]!, boxes[q * 4 + 2]!, boxes[q * 4 + 3]!]
    const box: NormBox = [clamp(cy - h / 2), clamp(cx - w / 2), clamp(cy + h / 2), clamp(cx + w / 2)]
    if (box[2] <= box[0] || box[3] <= box[1]) continue
    out.push({ box, label: labelOf(best), score: sigmoid(logits[q * classes + best]!) })
  }
  return out.sort((a, b) => b.score - a.score)
}

/** Share of the photo a box covers (0–1). */
export const area = (b: NormBox) => ((b[2] - b[0]) * (b[3] - b[1])) / 1_000_000

export function iou(a: NormBox, b: NormBox): number {
  const inter = intersection(a, b)
  return inter / (area(a) + area(b) - inter)
}

const contains = (b: NormBox, x: number, y: number) => y >= b[0] && y <= b[2] && x >= b[1] && x <= b[3]

function intersection(a: NormBox, b: NormBox): number {
  const h = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const w = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  return (h * w) / 1_000_000
}

/** The same thing found twice: one box mostly inside another of similar size. */
function sameThing(a: NormBox, b: NormBox): boolean {
  const small = Math.min(area(a), area(b))
  const large = Math.max(area(a), area(b))
  return intersection(a, b) / small >= 0.8 && large <= small * 1.6
}

export interface SuggestOptions {
  /** At most this many small suggestions. */
  max?: number
  minScore?: number
  /** Boxes overlapping more than this (IoU) are one thing, whatever their labels. */
  overlap?: number
  /** Boxes covering more of the photo than this are listed apart (desk, TV, wall). */
  bigArea?: number
  /** Labels never suggested (reflections and passers-by are rarely what a learner wants). */
  skip?: readonly string[]
}

/**
 * What to offer in a photo without a threshold to tune: the best candidates, with overlapping
 * ones merged across labels (the detector's labels are only guesses), split into things to draw
 * as boxes (`small`) and big background things to list apart (`big`).
 */
export function suggestObjects(all: readonly Detection[], options: SuggestOptions = {}): { small: Detection[]; big: Detection[] } {
  const { max = 12, minScore = 0.15, overlap = 0.5, bigArea = 0.35, skip = ['Person'] } = options
  const kept: Detection[] = []
  for (const d of all) {
    if (d.score < minScore) break
    if (skip.includes(d.label)) continue
    if (!kept.some((k) => iou(k.box, d.box) > overlap || sameThing(k.box, d.box))) kept.push(d)
  }
  return {
    small: kept.filter((d) => area(d.box) <= bigArea).slice(0, max),
    big: kept.filter((d) => area(d.box) > bigArea).slice(0, 4),
  }
}

/**
 * A square box (in pixels) around a tap where the detector found nothing, `size` thousandths of
 * the photo's short side, moved inside the photo when it would stick out. `aspect` = width / height.
 */
export function defaultBoxAt(x: number, y: number, aspect = 1, size = 220): NormBox {
  const w = aspect >= 1 ? size / aspect : size
  const h = aspect >= 1 ? size : size * aspect
  const left = Math.min(1000 - w, Math.max(0, x - w / 2))
  const top = Math.min(1000 - h, Math.max(0, y - h / 2))
  return [Math.round(top), Math.round(left), Math.round(top + h), Math.round(left + w)]
}

/** The candidates worth drawing: score ≥ `threshold`, near-duplicates (IoU > 0.7) dropped, best first. */
export function visibleDetections(all: readonly Detection[], threshold: number, max = 30): Detection[] {
  const kept: Detection[] = []
  for (const d of all) {
    if (kept.length >= max || d.score < threshold) break
    if (!kept.some((k) => iou(k.box, d.box) > 0.7)) kept.push(d)
  }
  return kept
}

/**
 * What a tap at (x, y) most likely means, among all candidates (also those too weak to draw):
 * of the boxes under the finger scoring at least half the best of them, the smallest — a tap on a
 * cup that stands on a desk means the cup.
 */
export function pickAt(all: readonly Detection[], x: number, y: number, minScore = 0.1, maxArea = 1): Detection | undefined {
  const under = all.filter((d) => d.score >= minScore && area(d.box) <= maxArea && contains(d.box, x, y))
  if (!under.length) return undefined
  const best = Math.max(...under.map((d) => d.score))
  return under.filter((d) => d.score >= best / 2).sort((a, b) => area(a.box) - area(b.box))[0]
}

/** `box` grown by `by` of its size on each side (context around the object for the AI), within the photo. */
export function padBox(box: NormBox, by = 0.2): NormBox {
  const dy = (box[2] - box[0]) * by
  const dx = (box[3] - box[1]) * by
  return [Math.max(0, box[0] - dy), Math.max(0, box[1] - dx), Math.min(1000, box[2] + dy), Math.min(1000, box[3] + dx)]
}
