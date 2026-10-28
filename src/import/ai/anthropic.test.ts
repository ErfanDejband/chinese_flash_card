import { describe, expect, it } from 'vitest'
import { createAnthropicProvider, DEFAULT_CLAUDE_MODEL } from './anthropic'
import { estimateClaudeCostUsd } from './pricing'
import { READING_JSON_SCHEMA, READING_SYSTEM_PROMPT, READING_TASK } from './prompt'
import { ProviderError, type FetchLike, type StreamProgress } from './types'

const KEY = 'sk-ant-api03-test-key'
const request = { imageBase64: 'AAAA', mime: 'image/jpeg', textHint: '老師 lǎoshī N teacher' }
const items = '{"items":[{"kind":"word","hanzi":"老師","pinyin":"lǎoshī","meaning":"teacher","partOfSpeech":"N","notes":"","hanziSource":"printed","pinyinSource":"printed","meaningSource":"printed","imageBox":[330,600,820,860],"confidence":0.97}]}'

const message = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5',
  content: [{ type: 'text', text: items }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 2000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  ...overrides,
})

function mockFetch(...responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = responses.shift()
    if (!next) throw new Error('unexpected request')
    return next
  }
  return { fetchImpl, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

describe('Claude provider (official SDK, mocked fetch)', () => {
  it('sends the page image with the JSON schema and refusal fallbacks for Opus 5', async () => {
    const { fetchImpl, calls } = mockFetch(json(message()))
    const res = await createAnthropicProvider({ apiKey: KEY, model: 'claude-opus-5', fetchImpl }).extractPage(request)

    expect(res.text).toBe(items)
    expect(res.usage).toEqual({ inputTokens: 2000, outputTokens: 500, costUsd: estimateClaudeCostUsd('claude-opus-5', 2000, 500), costSource: 'estimated' })

    const { url, init } = calls[0]!
    expect(url).toContain('https://api.anthropic.com/v1/messages')
    expect(url).not.toContain(KEY)
    const headers = new Headers(init.headers)
    expect(headers.get('x-api-key')).toBe(KEY)
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ model: 'claude-opus-5', fallbacks: 'default', max_tokens: 16000 })
    expect(body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } })
    expect(body.messages[0].content[1].text).toContain('老師 lǎoshī N teacher')
    expect(body.output_config.format.type).toBe('json_schema')
    expect(body.output_config.format.schema.additionalProperties).toBe(false)
  })

  it('sends the reading task as the system prompt and schema, and no image for a text-only request', async () => {
    const { fetchImpl, calls } = mockFetch(json(message()), json(message()))
    const provider = createAnthropicProvider({ apiKey: KEY, model: 'claude-opus-5', fetchImpl })
    await provider.extractPage({ ...request, task: READING_TASK })
    await provider.extractPage({ textHint: '', task: READING_TASK })
    const [withImage, textOnly] = calls.map((c) => JSON.parse(c.init.body as string))
    expect(withImage.system).toBe(READING_SYSTEM_PROMPT)
    expect(withImage.output_config.format.schema).toEqual(READING_JSON_SCHEMA)
    expect(withImage.messages[0].content.map((b: { type: string }) => b.type)).toEqual(['image', 'text'])
    expect(textOnly.messages[0].content).toEqual([{ type: 'text', text: READING_TASK.user('') }])
  })

  it('sends refusal fallbacks for Opus 5.5 (the default model) and Sonnet 5.5', async () => {
    for (const model of [DEFAULT_CLAUDE_MODEL, 'claude-sonnet-5-5']) {
      const { fetchImpl, calls } = mockFetch(json(message({ model })))
      const res = await createAnthropicProvider({ apiKey: KEY, model, fetchImpl }).extractPage(request)
      expect(JSON.parse(calls[0]!.init.body as string).fallbacks).toBe('default')
      expect(res.usage?.costUsd).toBe(estimateClaudeCostUsd(model, 2000, 500))
    }
    expect(DEFAULT_CLAUDE_MODEL).toBe('claude-opus-5-5')
    expect(estimateClaudeCostUsd('claude-opus-5-5', 1_000_000, 1_000_000)).toBe(24)
  })

  it('does not send fallbacks for other models', async () => {
    const { fetchImpl, calls } = mockFetch(json(message({ model: 'claude-haiku-4-5' })))
    const res = await createAnthropicProvider({ apiKey: KEY, model: 'claude-haiku-4-5', fetchImpl }).extractPage(request)
    const body = JSON.parse(calls[0]!.init.body as string)
    expect(body.fallbacks).toBeUndefined()
    expect(res.usage?.costUsd).toBeCloseTo((2000 * 1 + 500 * 5) / 1_000_000)
  })

  it('reports a refusal as a blocked page', async () => {
    const { fetchImpl } = mockFetch(json(message({ content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null } })))
    await expect(createAnthropicProvider({ apiKey: KEY, model: 'claude-opus-5', fetchImpl }).extractPage(request)).rejects.toMatchObject({
      kind: 'blocked',
    })
  })

  it('maps authentication and rate-limit errors', async () => {
    const error = (type: string) => ({ type: 'error', error: { type, message: type } })
    const { fetchImpl } = mockFetch(
      json(error('authentication_error'), 401),
      json(error('rate_limit_error'), 429, { 'retry-after': '7' }),
    )
    const provider = createAnthropicProvider({ apiKey: KEY, model: 'claude-opus-5', fetchImpl })
    await expect(provider.extractPage(request)).rejects.toMatchObject({ kind: 'auth', status: 401 })
    const rateLimited = await provider.extractPage(request).catch((e) => e)
    expect(rateLimited).toBeInstanceOf(ProviderError)
    expect(rateLimited).toMatchObject({ kind: 'rate-limit', retryAfterMs: 7000 })
  })

  it('lists only models that read images and support structured outputs', async () => {
    const caps = (image: boolean, structured: boolean) => ({ image_input: { supported: image }, structured_outputs: { supported: structured } })
    const { fetchImpl } = mockFetch(
      json({
        data: [
          { type: 'model', id: 'claude-opus-5', display_name: 'Claude Opus 5', created_at: '2026-01-01T00:00:00Z', capabilities: caps(true, true) },
          { type: 'model', id: 'claude-text-only', display_name: 'Text', created_at: '2026-01-01T00:00:00Z', capabilities: caps(false, true) },
          { type: 'model', id: 'claude-old', display_name: 'Old', created_at: '2025-01-01T00:00:00Z', capabilities: caps(true, false) },
        ],
        has_more: false,
        first_id: 'claude-opus-5',
        last_id: 'claude-old',
      }),
    )
    const models = await createAnthropicProvider({ apiKey: KEY, model: '', fetchImpl }).listModels()
    expect(models.map((m) => m.id)).toEqual(['claude-opus-5'])
  })
})

/** A Messages API stream: named events with JSON data, in small chunks (events cut in two). */
function stream(events: { type: string; [key: string]: unknown }[], chunk = 11) {
  const text = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
  const bytes = new TextEncoder().encode(text)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunk) controller.enqueue(bytes.slice(i, i + chunk))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

/** A streamed reply: a thinking block (text omitted, as by default), then `text` in three pieces. */
function streamedMessage(text: string, stopReason = 'end_turn') {
  const start = message({ content: [], stop_reason: null, usage: { input_tokens: 2000, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })
  return [
    { type: 'message_start', message: start },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    ...[text.slice(0, 15), text.slice(15, 120), text.slice(120)].map((t) => ({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: t } })),
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 500 } },
    { type: 'message_stop' },
  ]
}

describe('Claude provider, streaming (official SDK, mocked fetch)', () => {
  it('streams the same request and reports thinking, then the text as it arrives', async () => {
    const { fetchImpl, calls } = mockFetch(stream(streamedMessage(items)))
    const progress: StreamProgress[] = []
    const res = await createAnthropicProvider({ apiKey: KEY, model: 'claude-opus-5', fetchImpl }).extractPage({
      ...request,
      onProgress: (p) => progress.push(p),
    })

    expect(res.text).toBe(items)
    expect(res.usage).toEqual({ inputTokens: 2000, outputTokens: 500, costUsd: estimateClaudeCostUsd('claude-opus-5', 2000, 500), costSource: 'estimated' })
    const body = JSON.parse(calls[0]!.init.body as string)
    expect(body).toMatchObject({ stream: true, model: 'claude-opus-5', fallbacks: 'default', max_tokens: 16000 })
    expect(body.output_config.format.type).toBe('json_schema')
    expect(new Headers(calls[0]!.init.headers).get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    expect(progress.map((p) => p.phase)).toEqual(['thinking', 'thinking', 'writing', 'writing', 'writing'])
    expect(progress.at(-1)).toEqual({ phase: 'writing', text: items })
  })

  it('still checks the stop reason of a streamed reply', async () => {
    const { fetchImpl } = mockFetch(stream(streamedMessage('{"items":[', 'refusal')), stream(streamedMessage('{"items":[', 'max_tokens')))
    const provider = createAnthropicProvider({ apiKey: KEY, model: 'claude-opus-5', fetchImpl })
    await expect(provider.extractPage({ ...request, onProgress: () => {} })).rejects.toMatchObject({ kind: 'blocked' })
    await expect(provider.extractPage({ ...request, onProgress: () => {} })).rejects.toMatchObject({ kind: 'bad-response' })
  })

  it('maps an error event inside the stream by its type', async () => {
    const error = (type: string) => [
      ...streamedMessage(items).slice(0, 5),
      { type: 'error', error: { type, message: type === 'overloaded_error' ? 'Overloaded' : 'Slow down' } },
    ]
    const { fetchImpl } = mockFetch(stream(error('overloaded_error')), stream(error('rate_limit_error')))
    const provider = createAnthropicProvider({ apiKey: KEY, model: 'claude-opus-5', fetchImpl })
    const overloaded = await provider.extractPage({ ...request, onProgress: () => {} }).catch((e) => e)
    expect(overloaded).toBeInstanceOf(ProviderError)
    expect(overloaded).toMatchObject({ kind: 'server', status: 529, transient: true, message: expect.stringContaining('Overloaded') })
    await expect(provider.extractPage({ ...request, onProgress: () => {} })).rejects.toMatchObject({ kind: 'rate-limit', status: 429 })
  })

  it('maps HTTP errors before the stream as before', async () => {
    const { fetchImpl } = mockFetch(json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401))
    await expect(
      createAnthropicProvider({ apiKey: KEY, model: 'claude-opus-5', fetchImpl }).extractPage({ ...request, onProgress: () => {} }),
    ).rejects.toMatchObject({ kind: 'auth', status: 401 })
  })

  it('stops when the run is paused', async () => {
    const controller = new AbortController()
    const fetchImpl: FetchLike = async (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    const pending = createAnthropicProvider({ apiKey: KEY, model: 'claude-opus-5', fetchImpl }).extractPage({
      ...request,
      signal: controller.signal,
      onProgress: () => {},
    })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('estimateClaudeCostUsd', () => {
  it('uses the list price per million tokens', () => {
    expect(estimateClaudeCostUsd('claude-opus-5', 1_000_000, 1_000_000)).toBe(30)
    expect(estimateClaudeCostUsd('claude-sonnet-5', 2000, 500)).toBeCloseTo(0.009)
    expect(estimateClaudeCostUsd('some-unknown-model', 1, 1)).toBeUndefined()
  })
})
