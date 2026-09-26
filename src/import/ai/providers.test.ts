import { describe, expect, it, vi } from 'vitest'
import { BOOK3_P20_REPLY } from './fixtures'
import { createGeminiProvider, pickDefaultGeminiModel } from './gemini'
import { bytesToBase64 } from './http'
import { createOpenAICompatibleProvider } from './openaiCompatible'
import { ProviderError, type FetchLike } from './types'

const KEY = 'test-key-123'

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

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const request = { imageBase64: 'AAAA', mime: 'image/jpeg', textHint: '老師 lǎoshī N teacher' }

describe('Gemini provider', () => {
  it('sends the image, prompt and schema with the key in a header, not the URL', async () => {
    const { fetchImpl, calls } = mockFetch(
      json({ candidates: [{ content: { parts: [{ text: BOOK3_P20_REPLY }] }, finishReason: 'STOP' }], modelVersion: 'gemini-3.8-flash' }),
    )
    const provider = createGeminiProvider({ apiKey: KEY, model: 'gemini-3.8-flash', fetchImpl })
    const res = await provider.extractPage(request)

    expect(res).toEqual({ text: BOOK3_P20_REPLY, model: 'gemini-3.8-flash' })
    const { url, init } = calls[0]!
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
    expect(url).not.toContain(KEY)
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY)
    const body = JSON.parse(init.body as string)
    expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } })
    expect(body.contents[0].parts[1].text).toContain('老師 lǎoshī N teacher')
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', temperature: 0 })
    expect(body.generationConfig.responseSchema.properties.items.type).toBe('ARRAY')
  })

  it('maps 429 with RetryInfo to a rate-limit error', async () => {
    const { fetchImpl } = mockFetch(
      json({ error: { code: 429, message: 'Quota exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '31s' }] } }, 429),
    )
    const err = await createGeminiProvider({ apiKey: KEY, model: 'm', fetchImpl }).extractPage(request).catch((e) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect(err).toMatchObject({ kind: 'rate-limit', retryAfterMs: 31_000, status: 429 })
  })

  it('maps 403 to an auth error and blocked prompts to blocked', async () => {
    const { fetchImpl } = mockFetch(json({ error: { message: 'API key not valid' } }, 403), json({ promptFeedback: { blockReason: 'SAFETY' } }))
    const provider = createGeminiProvider({ apiKey: KEY, model: 'm', fetchImpl })
    await expect(provider.extractPage(request)).rejects.toMatchObject({ kind: 'auth' })
    await expect(provider.extractPage(request)).rejects.toMatchObject({ kind: 'blocked' })
  })

  it('lists generateContent models across pages', async () => {
    const { fetchImpl, calls } = mockFetch(
      json({
        models: [
          { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding', supportedGenerationMethods: ['embedContent'] },
        ],
        nextPageToken: 'next',
      }),
      json({ models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }] }),
    )
    const models = await createGeminiProvider({ apiKey: KEY, model: '', fetchImpl }).listModels()
    expect(models.map((m) => m.id)).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite'])
    expect(calls[1]!.url).toContain('pageToken=next')
    expect(calls.every((c) => !c.url.includes(KEY))).toBe(true)
  })
})

describe('pickDefaultGeminiModel', () => {
  const m = (...ids: string[]) => ids.map((id) => ({ id, label: id }))
  it.each([
    [m('gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3-flash-preview'), 'gemini-3.8-flash'],
    [m('gemini-3-flash-preview', 'gemini-flash-latest'), 'gemini-flash-latest'],
    [m('gemini-pro', 'gemini-3-flash-preview'), 'gemini-3-flash-preview'],
    [m('gemini-pro'), 'gemini-pro'],
    [[], undefined],
  ])('%o → %s', (models, expected) => {
    expect(pickDefaultGeminiModel(models)).toBe(expected)
  })
})

describe('OpenAI-compatible provider', () => {
  const base = 'https://openrouter.ai/api/v1/'

  it('sends a data-URL image with bearer auth and JSON mode', async () => {
    const { fetchImpl, calls } = mockFetch(json({ choices: [{ message: { content: BOOK3_P20_REPLY } }], model: 'vision:free' }))
    const res = await createOpenAICompatibleProvider({ baseUrl: base, apiKey: KEY, model: 'vision:free', fetchImpl }).extractPage(request)
    expect(res.text).toBe(BOOK3_P20_REPLY)
    const { url, init } = calls[0]!
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe(`Bearer ${KEY}`)
    expect(headers['X-OpenRouter-Title']).toBe('Mandarin Leitner')
    const body = JSON.parse(init.body as string)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } })
  })

  it('retries without response_format when the endpoint rejects it', async () => {
    const { fetchImpl, calls } = mockFetch(
      json({ error: { message: 'response_format is not supported by this model' } }, 400),
      json({ choices: [{ message: { content: [{ type: 'text', text: '{"items":[]}' }] } }] }),
    )
    const res = await createOpenAICompatibleProvider({ baseUrl: base, apiKey: KEY, model: 'm', fetchImpl }).extractPage(request)
    expect(res.text).toBe('{"items":[]}')
    expect(JSON.parse(calls[1]!.init.body as string).response_format).toBeUndefined()
  })

  it('lists models with vision and free markers', async () => {
    const { fetchImpl } = mockFetch(
      json({
        data: [
          { id: 'a/vision:free', name: 'Vision', architecture: { input_modalities: ['text', 'image'] }, pricing: { prompt: '0', completion: '0' } },
          { id: 'b/text', architecture: { input_modalities: ['text'] }, pricing: { prompt: '0.000001', completion: '0.000002' } },
          { id: 'c/local' },
        ],
      }),
    )
    const models = await createOpenAICompatibleProvider({ baseUrl: base, apiKey: KEY, model: '', fetchImpl }).listModels()
    expect(models).toEqual([
      { id: 'a/vision:free', label: 'Vision (a/vision:free)', vision: true, free: true },
      { id: 'b/text', label: 'b/text', vision: false, free: false },
      { id: 'c/local', label: 'c/local', vision: undefined, free: false },
    ])
  })

  it('reports network failures as ProviderError', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('Failed to fetch')
    }
    await expect(createOpenAICompatibleProvider({ baseUrl: base, apiKey: KEY, model: 'm', fetchImpl }).listModels()).rejects.toMatchObject({
      kind: 'network',
    })
  })
})

describe('bytesToBase64', () => {
  it('encodes large buffers', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256)
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
  })
})
