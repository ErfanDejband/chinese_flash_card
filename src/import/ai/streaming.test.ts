import { describe, expect, it, vi } from 'vitest'
import { BOOK2_P5_REPLY } from './fixtures'
import { createGeminiProvider } from './gemini'
import { requestStream } from './http'
import { createOpenAICompatibleProvider } from './openaiCompatible'
import { ProviderError, type FetchLike, type StreamProgress } from './types'

const KEY = 'test-key-123'
const request = { imageBase64: 'AAAA', mime: 'image/jpeg', textHint: '' }

/**
 * A Server-Sent Events reply. Objects become `data:` events, strings are sent as they are (comments,
 * `[DONE]`); the bytes arrive in small chunks, so events and multi-byte characters are cut in two.
 */
function sse(events: unknown[], { chunk = 7, eol = '\n', open = false } = {}) {
  const text = events.map((e) => (typeof e === 'string' ? e : `data: ${JSON.stringify(e)}${eol}${eol}`)).join('')
  const bytes = new TextEncoder().encode(text)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunk) controller.enqueue(bytes.slice(i, i + chunk))
      // `open`: the connection stays open (a reply still being written).
      if (!open) controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

function mockFetch(...responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl: FetchLike = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} })
    const next = responses.shift()
    if (!next) throw new Error('unexpected request')
    return next
  })
  return { fetchImpl, calls }
}

/** `reply` in three pieces, as content deltas. */
const pieces = (reply: string) => [reply.slice(0, 20), reply.slice(20, 200), reply.slice(200)]

describe('requestStream', () => {
  it('passes on each event, skipping comments and [DONE], whatever the line endings and chunk sizes', async () => {
    for (const eol of ['\n', '\r\n', '\r']) {
      for (const chunk of [1, 3, 64]) {
        const got: unknown[] = []
        const opened = vi.fn()
        const { fetchImpl } = mockFetch(sse([`: OPENROUTER PROCESSING${eol}${eol}`, { n: 1, s: '老師' }, { n: 2 }, `data: [DONE]${eol}${eol}`], { eol, chunk }))
        const plain = await requestStream(fetchImpl, 'https://x/y', { method: 'POST' }, { onOpen: opened, onData: (d) => got.push(d) })
        expect(plain).toBeUndefined()
        expect(opened).toHaveBeenCalledOnce()
        expect(got).toEqual([{ n: 1, s: '老師' }, { n: 2 }])
      }
    }
  })

  it('joins multi-line data and reads a last event without a blank line after it', async () => {
    const got: unknown[] = []
    const { fetchImpl } = mockFetch(sse(['event: message\ndata: {"a":\ndata: 1}\n\n', 'data: {"b":2}']))
    await requestStream(fetchImpl, 'https://x/y', {}, { onData: (d) => got.push(d) })
    expect(got).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('returns a reply that is not an event stream as JSON', async () => {
    const onData = vi.fn()
    const { fetchImpl } = mockFetch(json({ ok: true }))
    expect(await requestStream(fetchImpl, 'https://x/y', {}, { onData })).toEqual({ json: { ok: true } })
    expect(onData).not.toHaveBeenCalled()
  })

  it('maps HTTP errors before the stream like requestJson', async () => {
    const { fetchImpl } = mockFetch(json({ error: { message: 'slow down' } }, 429, { 'retry-after': '12' }), json({ error: { message: 'nope' } }, 401))
    await expect(requestStream(fetchImpl, 'https://x/y', {}, { onData: () => {} })).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: 12_000 })
    await expect(requestStream(fetchImpl, 'https://x/y', {}, { onData: () => {} })).rejects.toMatchObject({ kind: 'auth', status: 401 })
  })

  it('stops reading when the request is aborted', async () => {
    const controller = new AbortController()
    const { fetchImpl } = mockFetch(sse([{ n: 1 }], { open: true }))
    const pending = requestStream(fetchImpl, 'https://x/y', { signal: controller.signal }, {
      onData: () => controller.abort(new DOMException('Stopped by the user', 'AbortError')),
    })
    await expect(pending).rejects.toThrow('Stopped by the user')
  })
})

describe('OpenAI-compatible provider, streaming', () => {
  const base = 'https://openrouter.ai/api/v1'
  const meta = { id: 'gen-9', provider: 'Nvidia', model: 'nvidia/nemotron-vl:free' }

  it('reports thinking (with a token estimate) and then the text, and returns the reply with usage and meta', async () => {
    const { fetchImpl, calls } = mockFetch(
      sse([
        ': OPENROUTER PROCESSING\n\n',
        { ...meta, choices: [{ delta: { role: 'assistant', content: '', reasoning: 'Four pictures, each labelled. ' } }] },
        { ...meta, choices: [{ delta: { reasoning: 'The labels are pinyin only.' } }] },
        ...pieces(BOOK2_P5_REPLY).map((content) => ({ ...meta, choices: [{ delta: { content } }] })),
        { ...meta, choices: [{ delta: {}, finish_reason: 'stop' }] },
        { ...meta, choices: [], usage: { prompt_tokens: 900, completion_tokens: 700, completion_tokens_details: { reasoning_tokens: 600 }, cost: 0 } },
        'data: [DONE]\n\n',
      ]),
    )
    const progress: StreamProgress[] = []
    const provider = createOpenAICompatibleProvider({ baseUrl: base, apiKey: KEY, model: 'openrouter/free', fetchImpl })
    const res = await provider.extractPage({ ...request, onProgress: (p) => progress.push(p) })

    expect(res).toEqual({
      text: BOOK2_P5_REPLY,
      model: 'nvidia/nemotron-vl:free',
      usage: { inputTokens: 900, outputTokens: 700, costUsd: 0, costSource: 'reported' },
      meta: { id: 'gen-9', provider: 'Nvidia', reasoningTokens: 600, finishReason: 'stop' },
    })
    const body = JSON.parse(calls[0]!.init.body as string)
    expect(body).toMatchObject({ stream: true, stream_options: { include_usage: true }, response_format: { type: 'json_object' } })
    expect(progress[0]).toEqual({ phase: 'thinking', text: '' })
    expect(progress[1]).toEqual({ phase: 'thinking', reasoningTokens: 8, text: '' })
    expect(progress.at(-1)).toEqual({ phase: 'writing', reasoningTokens: 14, text: BOOK2_P5_REPLY })
    expect(progress.map((p) => p.phase)).toEqual(['thinking', 'thinking', 'thinking', 'writing', 'writing', 'writing'])
  })

  it('counts `reasoning_content` as thinking too', async () => {
    const { fetchImpl } = mockFetch(sse([{ choices: [{ delta: { reasoning_content: 'abcdefgh' } }] }, { choices: [{ delta: { content: '{"items":[]}' } }] }]))
    const progress: StreamProgress[] = []
    await createOpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', apiKey: '', model: 'm', fetchImpl }).extractPage({
      ...request,
      onProgress: (p) => progress.push(p),
    })
    expect(progress.slice(1)).toEqual([
      { phase: 'thinking', reasoningTokens: 2, text: '' },
      { phase: 'writing', reasoningTokens: 2, text: '{"items":[]}' },
    ])
  })

  it('takes a plain reply from a server that ignores `stream`', async () => {
    const { fetchImpl } = mockFetch(json({ choices: [{ message: { content: '{"items":[]}' }, finish_reason: 'stop' }], model: 'mock-vision' }))
    const res = await createOpenAICompatibleProvider({ baseUrl: 'http://127.0.0.1:8799/v1', apiKey: '', model: 'mock-vision', fetchImpl }).extractPage({
      ...request,
      onProgress: () => {},
    })
    expect(res).toMatchObject({ text: '{"items":[]}', model: 'mock-vision', meta: { finishReason: 'stop' } })
  })

  it('asks for a plain reply when the server rejects the streaming options', async () => {
    const { fetchImpl, calls } = mockFetch(
      json({ error: { message: 'Unrecognized request argument supplied: stream_options' } }, 400),
      json({ choices: [{ message: { content: '{"items":[]}' } }] }),
    )
    const res = await createOpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', apiKey: '', model: 'm', fetchImpl }).extractPage({
      ...request,
      onProgress: () => {},
    })
    expect(res.text).toBe('{"items":[]}')
    const [first, second] = calls.map((c) => JSON.parse(c.init.body as string))
    expect([first.stream, second.stream]).toEqual([true, undefined])
    expect(second.response_format).toEqual({ type: 'json_object' })
  })

  it('keeps the JSON-mode fallback, still streaming', async () => {
    const { fetchImpl, calls } = mockFetch(
      json({ error: { message: 'response_format is not supported by this model' } }, 400),
      sse([{ choices: [{ delta: { content: '{"items":[]}' }, finish_reason: 'stop' }] }]),
    )
    const res = await createOpenAICompatibleProvider({ baseUrl: base, apiKey: KEY, model: 'm', fetchImpl }).extractPage({ ...request, onProgress: () => {} })
    expect(res).toMatchObject({ text: '{"items":[]}', meta: { jsonFallback: true, finishReason: 'stop' } })
    const second = JSON.parse(calls[1]!.init.body as string)
    expect(second.response_format).toBeUndefined()
    expect(second.stream).toBe(true)
  })

  it('turns an error sent mid-stream into a ProviderError', async () => {
    const midStream = (error: unknown) => sse([{ choices: [{ delta: { content: '{"items":[' } }] }, { error, choices: [{ delta: { content: '' }, finish_reason: 'error' }] }])
    const { fetchImpl } = mockFetch(
      midStream({ code: 'server_error', message: 'Provider disconnected unexpectedly' }),
      midStream({ code: 429, message: 'Rate limit exceeded upstream' }),
      sse([{ choices: [{ delta: { content: '{"it' }, finish_reason: 'error' }] }]),
    )
    const provider = createOpenAICompatibleProvider({ baseUrl: base, apiKey: KEY, model: 'm', fetchImpl })
    const go = () => provider.extractPage({ ...request, onProgress: () => {} })
    const server = await go().catch((e) => e)
    expect(server).toBeInstanceOf(ProviderError)
    expect(server).toMatchObject({ kind: 'server', transient: true, message: expect.stringContaining('Provider disconnected') })
    await expect(go()).rejects.toMatchObject({ kind: 'rate-limit', status: 429 })
    await expect(go()).rejects.toMatchObject({ kind: 'server' })
  })

  it('sends a plain request when no one follows progress (pictures, the model test)', async () => {
    const { fetchImpl, calls } = mockFetch(json({ choices: [{ message: { content: '{"items":[]}' } }] }))
    await createOpenAICompatibleProvider({ baseUrl: base, apiKey: KEY, model: 'm', fetchImpl }).extractPage(request)
    expect(JSON.parse(calls[0]!.init.body as string).stream).toBeUndefined()
  })
})

describe('Gemini provider, streaming', () => {
  const candidate = (parts: { text: string; thought?: boolean }[], finishReason?: string) => ({ candidates: [{ content: { role: 'model', parts }, ...(finishReason && { finishReason }) }] })

  it('streams with alt=sse, leaves out thought parts, and takes usage and the finish reason from the last event', async () => {
    const [a, b, c] = pieces(BOOK2_P5_REPLY)
    const { fetchImpl, calls } = mockFetch(
      sse([
        { ...candidate([{ text: 'Looking at the pictures…', thought: true }]), modelVersion: 'gemini-3.8-flash' },
        { ...candidate([{ text: a! }]), modelVersion: 'gemini-3.8-flash', usageMetadata: { promptTokenCount: 1800 } },
        candidate([{ text: b! }, { text: c! }]),
        { ...candidate([{ text: '' }], 'STOP'), usageMetadata: { promptTokenCount: 1800, candidatesTokenCount: 120, thoughtsTokenCount: 300 } },
      ]),
    )
    const progress: StreamProgress[] = []
    const res = await createGeminiProvider({ apiKey: KEY, model: 'gemini-3.8-flash', fetchImpl }).extractPage({ ...request, onProgress: (p) => progress.push(p) })

    expect(res).toEqual({ text: BOOK2_P5_REPLY, model: 'gemini-3.8-flash', usage: { inputTokens: 1800, outputTokens: 420 } })
    expect(calls[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse')
    expect(calls[0]!.url).not.toContain(KEY)
    expect((calls[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY)
    expect(progress.map((p) => [p.phase, p.text.length])).toEqual([
      ['thinking', 0],
      ['thinking', 0],
      ['writing', a!.length],
      ['writing', BOOK2_P5_REPLY.length],
    ])
  })

  it('reports a blocked page and an error sent mid-stream', async () => {
    const { fetchImpl } = mockFetch(
      sse([{ promptFeedback: { blockReason: 'SAFETY' } }]),
      sse([candidate([{ text: '{"items":[' }]), candidate([], 'RECITATION')]),
      sse([candidate([{ text: '{"items":[' }]), { error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } }]),
    )
    const provider = createGeminiProvider({ apiKey: KEY, model: 'm', fetchImpl })
    const go = () => provider.extractPage({ ...request, onProgress: () => {} })
    await expect(go()).rejects.toMatchObject({ kind: 'blocked' })
    await expect(go()).rejects.toMatchObject({ kind: 'blocked', message: expect.stringContaining('RECITATION') })
    await expect(go()).rejects.toMatchObject({ kind: 'server', status: 503 })
  })
})
