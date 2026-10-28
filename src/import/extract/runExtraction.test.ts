import { describe, expect, it } from 'vitest'
import { BOOK2_P5_REPLY, BOOK3_P20_REPLY, READING_REPLY } from '../ai/fixtures'
import { ModelOutputError } from '../ai/parse'
import { PROMPT_VERSION, READING_PROMPT_VERSION, READING_TASK, VOCAB_TASK } from '../ai/prompt'
import { ProviderError, type PageRequest, type VisionProvider } from '../ai/types'
import { FatalExtractionError, runExtraction, type AttemptEvent, type ExtractionDeps, type ExtractionEvent, type PageResult, type RenderedPage } from './runExtraction'

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
    expect(t.requests[0]!.task).toBe(VOCAB_TASK)
    expect(t.saved[0]!.promptVersion).toBe(PROMPT_VERSION)
    expect(t.saved[0]!.reading).toBeUndefined()
  })

  it('splits reading pages into word drafts without crops and keeps the sentences', async () => {
    const t = setup([READING_REPLY], { mode: 'reading', context: { existingHanzi: new Set(['媽媽']), seenInImport: new Set() } })
    expect(await runExtraction([1], t.deps)).toEqual({ done: 1, failed: 0 })
    expect(t.requests[0]!.task).toBe(READING_TASK)
    const [page] = t.saved
    expect(page!.promptVersion).toBe(READING_PROMPT_VERSION)
    expect(page!.reading!.map((s) => s.text)).toEqual(['小明和媽媽一起去公園散步。', '他看到一隻小狗在草地上跑來跑去。', '小狗很可愛，小明笑了。'])
    expect(page!.drafts).toHaveLength(19)
    expect(page!.drafts.some((d) => d.hanzi === '媽媽' || d.crop)).toBe(false)
    expect(page!.drafts[0]!.example?.hanzi).toBe('小明和媽媽一起去公園散步。')
  })

  it('waits for Retry-After on a rate limit, then continues', async () => {
    const t = setup([new ProviderError('rate-limit', 'slow down', { retryAfterMs: 5000 }), BOOK3_P20_REPLY])
    await runExtraction([20], t.deps)
    expect(t.sleeps).toEqual([5250])
    expect(t.events.filter((e) => e.type !== 'page-stage').map((e) => e.type)).toEqual(['page-start', 'waiting', 'page-done'])
  })

  it('reports each step of a page, and the try after a wait (sending again ends the wait)', async () => {
    const t = setup(['not json', new ProviderError('server', 'oops', { status: 502 }), BOOK3_P20_REPLY])
    await runExtraction([20], t.deps)
    const steps = t.events.map((e) =>
      e.type === 'page-stage' ? `${e.stage} ${e.attempt}` : e.type === 'waiting' ? `wait → ${e.attempt} of ${e.maxAttempts}` : e.type,
    )
    expect(steps).toEqual([
      'page-start',
      'preparing 1',
      'sending 1',
      'checking 1',
      'wait → 2 of 4',
      'sending 2',
      'wait → 3 of 4',
      'sending 3',
      'checking 3',
      'saving 3',
      'page-done',
    ])
    const sent = t.events.filter((e) => e.type === 'page-stage' && e.stage === 'sending')
    expect(sent.every((e) => e.type === 'page-stage' && e.preview?.type === 'image/jpeg')).toBe(true)
  })

  it('streams the reply when someone follows the events, a few updates a second at most', async () => {
    const t = setup([])
    t.deps.provider = {
      label: 'streaming',
      listModels: async () => [],
      extractPage: async (req) => {
        for (let i = 1; i <= 50; i++) req.onProgress?.({ phase: 'thinking', reasoningTokens: i * 10, text: '' })
        for (let i = 1; i <= 50; i++) req.onProgress?.({ phase: 'writing', reasoningTokens: 500, text: BOOK3_P20_REPLY.slice(0, i) })
        return { text: BOOK3_P20_REPLY, model: 'fake-model' }
      },
    }
    await runExtraction([20], t.deps)
    const streamed = t.events.filter((e) => e.type === 'page-stage' && (e.stage === 'thinking' || e.stage === 'writing'))
    // Within the same 200 ms only a new phase goes through.
    expect(streamed).toEqual([
      { type: 'page-stage', page: 20, stage: 'thinking', attempt: 1, reasoningTokens: 10, text: '' },
      { type: 'page-stage', page: 20, stage: 'writing', attempt: 1, reasoningTokens: 500, text: BOOK3_P20_REPLY.slice(0, 1) },
    ])
  })

  it('asks for a streamed reply only when someone follows the events', async () => {
    const followed = setup([BOOK3_P20_REPLY])
    await runExtraction([20], followed.deps)
    expect(followed.requests[0]!.onProgress).toBeTypeOf('function')
    const unfollowed = setup([BOOK3_P20_REPLY], { onEvent: undefined })
    await runExtraction([20], unfollowed.deps)
    expect(unfollowed.requests[0]!.onProgress).toBeUndefined()
  })

  it('reports every attempt, failed requests and malformed replies included', async () => {
    const attempts: AttemptEvent[] = []
    const t = setup(['not json', new ProviderError('rate-limit', 'slow down', { retryAfterMs: 10 }), BOOK3_P20_REPLY], {
      onAttempt: (e) => attempts.push(e),
    })
    await runExtraction([20], t.deps)
    const kind = (e: unknown) => (e instanceof ProviderError ? e.kind : e instanceof ModelOutputError ? 'bad-json' : e)
    expect(attempts.map((a) => [a.page, a.imageBytes, a.response ? a.response.text === BOOK3_P20_REPLY : 'no reply', kind(a.error)])).toEqual([
      [20, 2, false, 'bad-json'],
      [20, 2, 'no reply', 'rate-limit'],
      [20, 2, true, undefined],
    ])
    expect(attempts.every((a) => a.ms >= 0 && a.startedAt > 0)).toBe(true)
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

  it('stops at once when a daily limit is used up', async () => {
    const t = setup([new ProviderError('quota', 'Daily limit reached: free-models-per-day', { status: 429 }), BOOK3_P20_REPLY])
    await expect(runExtraction([1, 2], t.deps)).rejects.toThrow(/Resume the remaining pages tomorrow/)
    expect(t.sleeps).toEqual([])
    expect(t.requests).toHaveLength(1)
    expect(t.errors.map(([page]) => page)).toEqual([1])
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
