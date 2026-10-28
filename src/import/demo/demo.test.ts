import { describe, expect, it } from 'vitest'
import { parseModelJson, validateItems } from '../ai/parse'
import type { StreamProgress } from '../ai/types'
import { postprocess } from '../extract/postprocess'
import { loadSimplifiedDetector } from '../extract/traditional'
import { createDemoProvider, DEMO_MODEL } from './demoProvider'
import { SAMPLE_ITEMS, sampleReply, samplePictureBox } from './samplePage'

async function demoDrafts() {
  const response = await createDemoProvider(0).extractPage({ textHint: '' })
  const { items } = validateItems(parseModelJson(response.text))
  return postprocess(items, { existingHanzi: new Set(), seenInImport: new Set(), isSimplified: await loadSimplifiedDetector() })
}

describe('import demo', () => {
  it('answers with every sample word, each with its picture box', async () => {
    const drafts = await demoDrafts()
    expect(drafts.map((d) => d.hanzi)).toEqual(['書包', '手機', '學校', '雨傘', '咖啡', '电脑'])
    drafts.forEach((d, i) => expect(d.imageBox).toEqual(samplePictureBox(i)))
  })

  it('shows two flags on purpose: characters filled in, and a Simplified spelling', async () => {
    const flags = Object.fromEntries((await demoDrafts()).map((d) => [d.hanzi, d.flags]))
    expect(flags['咖啡']).toEqual(['hanzi-inferred'])
    expect(flags['电脑']).toEqual(['maybe-simplified'])
    for (const hanzi of ['書包', '手機', '學校', '雨傘']) expect(flags[hanzi]).toEqual([])
  })

  it('keeps every picture box on the page and apart from the others', () => {
    const boxes = SAMPLE_ITEMS.map((_, i) => samplePictureBox(i))
    for (const [ymin, xmin, ymax, xmax] of boxes) {
      expect(0 <= ymin && ymin < ymax && ymax <= 1000 && 0 <= xmin && xmin < xmax && xmax <= 1000).toBe(true)
    }
    const overlaps = (a: number[], b: number[]) => a[0]! < b[2]! && b[0]! < a[2]! && a[1]! < b[3]! && b[1]! < a[3]!
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)))
  })

  it('stops waiting when the run is paused', async () => {
    const controller = new AbortController()
    const pending = createDemoProvider(10_000).extractPage({ textHint: '', signal: controller.signal })
    controller.abort(new DOMException('Stopped by the user', 'AbortError'))
    await expect(pending).rejects.toThrow('Stopped by the user')
  })

  it('acts like a streaming model when progress is followed: thinking with a rising count, then the reply in pieces', async () => {
    const progress: StreamProgress[] = []
    const response = await createDemoProvider(0).extractPage({ textHint: '', onProgress: (p) => progress.push(p) })
    expect(response).toEqual({ text: sampleReply(), model: DEMO_MODEL })
    const thinking = progress.filter((p) => p.phase === 'thinking')
    const writing = progress.filter((p) => p.phase === 'writing')
    expect(progress.indexOf(writing[0]!)).toBe(thinking.length)
    const counts = thinking.map((p) => p.reasoningTokens ?? 0)
    expect(counts).toEqual([...counts].sort((a, b) => a - b))
    expect(counts.at(-1)).toBeGreaterThan(0)
    writing.forEach((p, i) => i > 0 && expect(p.text.startsWith(writing[i - 1]!.text)).toBe(true))
    expect(writing.at(-1)!.text).toBe(sampleReply())
  })

  it('stops streaming when the run is paused', async () => {
    const controller = new AbortController()
    const pending = createDemoProvider(10_000).extractPage({
      textHint: '',
      signal: controller.signal,
      onProgress: () => controller.abort(new DOMException('Stopped by the user', 'AbortError')),
    })
    await expect(pending).rejects.toThrow('Stopped by the user')
  })
})
