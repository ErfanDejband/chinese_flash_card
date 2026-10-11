import { describe, expect, it } from 'vitest'
import { ProviderError, type PageRequest, type VisionProvider } from '@/import/ai/types'
import { LOCATE_TASK } from './locate'
import { makeSheet, planPictures } from './make'
import { PLAN_TASK } from './plan'
import { gridBox, layoutFor } from './sheet'
import { pictureStyle } from './styles'
import type { PictureGenerator, SheetRequest } from './types'

function assistant(replies: (string | Error)[]) {
  const requests: PageRequest[] = []
  const provider: VisionProvider = {
    label: 'fake',
    listModels: async () => [],
    extractPage: async (req) => {
      requests.push(req)
      const next = replies.shift()
      if (next === undefined) throw new Error('no more replies')
      if (next instanceof Error) throw next
      return { text: next, model: 'assistant-model', usage: { inputTokens: 10, outputTokens: 5 } }
    },
  }
  return { provider, requests }
}

function generator() {
  const requests: SheetRequest[] = []
  const gen: PictureGenerator = {
    label: 'fake',
    listModels: async () => [],
    generate: async (req) => {
      requests.push(req)
      return { image: new Blob(['sheet'], { type: 'image/png' }), model: 'image-model', usage: { inputTokens: 1, outputTokens: 400 } }
    },
  }
  return { gen, requests }
}

const noWait = { sleep: async () => {}, random: () => 0.5 }
const words = Array.from({ length: 31 }, (_, i) => ({ hanzi: `字${i}`, pinyin: 'zì', meaning: `word ${i}` }))
const planReply = (n: number) =>
  JSON.stringify({ words: Array.from({ length: n }, (_, i) => ({ index: i + 1, picturable: i !== 0, scene: `scene ${i + 1}`, emoji: '🐶', searchQuery: 'q' })) })

describe('planPictures', () => {
  it('asks in batches of 30 and records usage', async () => {
    const a = assistant([planReply(30), planReply(1)])
    const usage: string[] = []
    const { plans, failed } = await planPictures(words, a.provider, { ...noWait, usage: { assistant: (m) => usage.push(m) } })
    expect(a.requests.map((r) => r.task)).toEqual([PLAN_TASK, PLAN_TASK])
    expect(a.requests[0]!.imageBase64).toBeUndefined()
    expect(a.requests[1]!.textHint).toBe('1. 字30 (zì): word 30')
    expect(plans).toHaveLength(31)
    expect(plans[0]).toMatchObject({ picturable: false, scene: 'scene 1' })
    expect(plans[30]).toMatchObject({ picturable: false, scene: 'scene 1' })
    expect(failed).toBe(false)
    expect(usage).toEqual(['assistant-model', 'assistant-model'])
  })

  it('falls back to drawing the meaning without an assistant or when a batch fails', async () => {
    expect((await planPictures(words.slice(0, 2), undefined)).plans).toEqual([
      { picturable: true, scene: 'word 0', emoji: '', searchQuery: 'word 0' },
      { picturable: true, scene: 'word 1', emoji: '', searchQuery: 'word 1' },
    ])
    const a = assistant([new ProviderError('auth', 'bad key')])
    const res = await planPictures(words.slice(0, 2), a.provider, noWait)
    expect(res.failed).toBe(true)
    expect(res.plans[1]!.scene).toBe('word 1')
  })
})

describe('makeSheet', () => {
  const cells = [
    { scene: 'a puppy', label: 'puppy: a puppy' },
    { scene: 'a park', label: 'park: a park' },
    { scene: 'a lawn', label: 'lawn: a lawn' },
  ]
  const toBase64 = async () => 'SHEET64'

  it('draws one sheet in the style, then places each picture with the assistant', async () => {
    const g = generator()
    const a = assistant([JSON.stringify({ pictures: [{ index: 1, box: [20, 20, 480, 480] }, { index: 2, box: null }, { index: 3, box: [520, 30, 980, 470] }] })])
    const made = await makeSheet(cells, pictureStyle('textbook'), g.gen, a.provider, { ...noWait, toBase64 })

    expect(g.requests[0]).toMatchObject({ aspect: '1:1', quality: 'medium' })
    expect(g.requests[0]!.prompt).toContain('3. a lawn\n4. leave this cell empty')
    expect(a.requests[0]).toMatchObject({ imageBase64: 'SHEET64', task: LOCATE_TASK, textHint: '1. puppy: a puppy\n2. park: a park\n3. lawn: a lawn' })
    expect(made.located).toEqual([true, false, true])
    expect(made.boxes[1]).toEqual(gridBox(layoutFor(3), 1))
    expect(made.model).toBe('image-model')
  })

  it('uses the grid when locating fails, and skips locating for four versions of one word', async () => {
    const g = generator()
    const failing = assistant([new ProviderError('auth', 'no')])
    const grid = await makeSheet(cells, pictureStyle('flat'), g.gen, failing.provider, { ...noWait, toBase64 })
    expect(grid.located).toEqual([false, false, false])

    const quiet = assistant([])
    const variants = await makeSheet([cells[0]!], pictureStyle('flat'), g.gen, quiet.provider, { ...noWait, toBase64, variants: true })
    expect(quiet.requests).toHaveLength(0)
    expect(variants.boxes).toEqual([0, 1, 2, 3].map((i) => gridBox(layoutFor(4), i)))
    expect(g.requests[1]!.prompt).toContain('a puppy (version 4')
  })

  it('retries a busy image service, then gives up with its error', async () => {
    let calls = 0
    const flaky: PictureGenerator = {
      label: 'flaky',
      listModels: async () => [],
      generate: async () => {
        calls++
        throw new ProviderError('server', 'overloaded')
      },
    }
    await expect(makeSheet(cells, pictureStyle('flat'), flaky, undefined, { ...noWait, toBase64 })).rejects.toMatchObject({ kind: 'server' })
    expect(calls).toBe(3)
  })
})
