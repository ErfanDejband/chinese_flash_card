import { describe, expect, it } from 'vitest'
import { createAnthropicProvider } from './anthropic'
import { estimateClaudeCostUsd } from './pricing'
import { ProviderError, type FetchLike } from './types'

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

describe('estimateClaudeCostUsd', () => {
  it('uses the list price per million tokens', () => {
    expect(estimateClaudeCostUsd('claude-opus-5', 1_000_000, 1_000_000)).toBe(30)
    expect(estimateClaudeCostUsd('claude-sonnet-5', 2000, 500)).toBeCloseTo(0.009)
    expect(estimateClaudeCostUsd('some-unknown-model', 1, 1)).toBeUndefined()
  })
})
