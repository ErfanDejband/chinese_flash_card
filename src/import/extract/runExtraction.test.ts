import { describe, expect, it } from 'vitest'
import { BOOK2_P5_REPLY, BOOK3_P20_REPLY } from '../ai/fixtures'
import { ProviderError, type PageRequest, type VisionProvider } from '../ai/types'
import { FatalExtractionError, runExtraction, type ExtractionDeps, type ExtractionEvent, type PageResult, type RenderedPage } from './runExtraction'

type Reply = string | ProviderError

function setup(replies: Reply[], overrides: Partial<ExtractionDeps> = {}) {
  const requests: PageRequest[] = []
  const saved: PageResult[] = []
  const errors: [number, string][] = []
  const events: ExtractionEvent[] = []
  const sleeps: number[] = []
  const provider: VisionProvider = {
    label: 'fake',
    listModels: async () => [],
    extractPage: async (req) => {
      requests.push(req)
      const next = replies.shift()
      if (next === undefined) throw new Error('no more replies')
      if (next instanceof ProviderError) throw next
      return { text: next, model: 'fake-model' }
    },
  }
  const render = async (page: number): Promise<RenderedPage> => ({
    page,
    image: new Blob(['full']),
    width: 1920,
    height: 1080,
    pointWidth: 960,
    pointHeight: 540,
    aiImage: new Blob(['ai'], { type: 'image/jpeg' }),
    textHint: `hint ${page}`,
  })
  const deps: ExtractionDeps = {
    provider,
    render,
    crop: async () => ({ blob: new Blob(['crop']), mime: 'image/webp', width: 100, height: 80 }),
    toBase64: async () => 'BASE64',
    store: {
      markRunning: async () => {},
      saveResult: async (r) => {
        saved.push(r)
      },
      markError: async (page, message) => {
        errors.push([page, message])
      },
    },
    context: { existingHanzi: new Set(), seenInImport: new Set() },
    onEvent: (e) => events.push(e),
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    random: () => 0.5,
    ...overrides,
  }
  return { deps, requests, saved, errors, events, sleeps }
}

describe('runExtraction', () => {
  it('processes pages in order and persists drafts with crops and provenance', async () => {
    const t = setup([BOOK2_P5_REPLY, BOOK3_P20_REPLY])
    const result = await runExtraction([5, 20], t.deps)

    expect(result).toEqual({ done: 2, failed: 0 })
    expect(t.requests.map((r) => r.textHint)).toEqual(['hint 5', 'hint 20'])
    expect(t.requests[0]).toMatchObject({ imageBase64: 'BASE64', mime: 'image/jpeg' })
    expect(t.saved.map((s) => s.drafts.map((d) => d.hanzi))).toEqual([['牙', '鴨子', '家', '蝦'], ['老師']])
    const teacher = t.saved[1]!.drafts[0]!
    expect(teacher.crop?.mime).toBe('image/webp')
    // imageBox [330, 600, 820, 860] on a 960 × 540 pt page
    expect(teacher.sourceBox).toEqual({ x: 576, y: 178.2, width: 249.6, height: 264.6 })
    expect(t.saved[0]!.model).toBe('fake-model')
  })

  it('waits for Retry-After on a rate limit, then continues', async () => {
    const t = setup([new ProviderError('rate-limit', 'slow down', { retryAfterMs: 5000 }), BOOK3_P20_REPLY])
    await runExtraction([20], t.deps)
    expect(t.sleeps).toEqual([5250])
    expect(t.events.map((e) => e.type)).toEqual(['page-start', 'waiting', 'page-done'])
  })

  it('retries malformed output once, then records the page as failed and moves on', async () => {
    const t = setup(['not json', 'still not json', BOOK3_P20_REPLY])
    const result = await runExtraction([3, 20], t.deps)
    expect(result).toEqual({ done: 1, failed: 1 })
    expect(t.errors[0]![0]).toBe(3)
    expect(t.saved.map((s) => s.rendered.page)).toEqual([20])
  })

  it('stops the run on a rejected key', async () => {
    const t = setup([new ProviderError('auth', 'bad key', { status: 403 }), BOOK3_P20_REPLY])
    await expect(runExtraction([1, 2], t.deps)).rejects.toBeInstanceOf(FatalExtractionError)
    expect(t.requests).toHaveLength(1)
  })

  it('stops the run when the quota stays exhausted', async () => {
    const limited = () => new ProviderError('rate-limit', 'quota', { status: 429 })
    const t = setup([limited(), limited(), limited(), limited()])
    await expect(runExtraction([1, 2], t.deps)).rejects.toBeInstanceOf(FatalExtractionError)
    expect(t.sleeps).toHaveLength(3) // 4 attempts
  })

  it('can be cancelled between pages', async () => {
    const controller = new AbortController()
    const t = setup([BOOK3_P20_REPLY, BOOK3_P20_REPLY], {
      onEvent: (e) => {
        if (e.type === 'page-done') controller.abort(new DOMException('stopped', 'AbortError'))
      },
      signal: controller.signal,
    })
    await expect(runExtraction([1, 2], t.deps)).rejects.toMatchObject({ name: 'AbortError' })
    expect(t.saved).toHaveLength(1)
  })

  it('drops boxes the cropper rejects', async () => {
    const t = setup([BOOK3_P20_REPLY], { crop: async () => null })
    await runExtraction([20], t.deps)
    expect(t.saved[0]!.drafts[0]).toMatchObject({ imageBox: null })
    expect(t.saved[0]!.drafts[0]!.crop).toBeUndefined()
  })
})
