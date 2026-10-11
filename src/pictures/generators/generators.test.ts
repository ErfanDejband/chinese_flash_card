import { describe, expect, it } from 'vitest'
import type { FetchLike } from '@/import/ai/types'
import { createGeminiGenerator } from './gemini'
import { createOpenAIGenerator } from './openai'
import { createOpenRouterGenerator } from './openrouter'

const PNG = btoa('fake-png-bytes')

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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const body = (c: { init: RequestInit }) => JSON.parse(c.init.body as string)
const request = { prompt: 'A sheet of pictures', aspect: '3:2' as const, quality: 'low' as const }

describe('OpenRouter generator', () => {
  const models = () =>
    json({
    data: [
      { id: 'openai/gpt-image-1-mini', name: 'GPT Image 1 Mini', supported_parameters: { aspect_ratio: { values: ['1:1', '3:2'] }, quality: { values: ['low', 'medium'] } } },
      { id: 'google/gemini-3.1-flash-lite-image', supported_parameters: { aspect_ratio: { values: ['1:1', '3:2'] }, resolution: { values: ['1K'] } } },
    ],
  })

  it('sends only the parameters the model supports and reports the cost', async () => {
    const { fetchImpl, calls } = mockFetch(models(), json({ data: [{ b64_json: PNG, media_type: 'image/png' }], usage: { prompt_tokens: 120, completion_tokens: 400, cost: 0.0062 } }))
    const gen = createOpenRouterGenerator({ apiKey: 'sk-or-test', model: 'openai/gpt-image-1-mini', fetchImpl })
    const res = await gen.generate(request)

    expect(calls[1]!.url).toBe('https://openrouter.ai/api/v1/images')
    expect(new Headers(calls[1]!.init.headers).get('authorization')).toBe('Bearer sk-or-test')
    expect(body(calls[1]!)).toEqual({ model: 'openai/gpt-image-1-mini', prompt: 'A sheet of pictures', n: 1, aspect_ratio: '3:2', quality: 'low' })
    expect(res.image.type).toBe('image/png')
    expect(await res.image.text()).toBe('fake-png-bytes')
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 400, costUsd: 0.0062, costSource: 'reported' })
  })

  it('lists image models and sends resolution where supported', async () => {
    const { fetchImpl, calls } = mockFetch(models(), json({ data: [{ b64_json: PNG }] }))
    const gen = createOpenRouterGenerator({ apiKey: 'k', model: 'google/gemini-3.1-flash-lite-image', fetchImpl })
    expect((await gen.listModels()).map((m) => m.label)).toEqual(['GPT Image 1 Mini (openai/gpt-image-1-mini)', 'google/gemini-3.1-flash-lite-image'])
    await gen.generate(request)
    expect(body(calls[1]!)).toEqual({ model: 'google/gemini-3.1-flash-lite-image', prompt: 'A sheet of pictures', n: 1, aspect_ratio: '3:2', resolution: '1K' })
  })

  it('maps no credit to a ProviderError and an empty reply to bad-response', async () => {
    const { fetchImpl } = mockFetch(models(), json({ error: { message: 'Insufficient credits' } }, 402), json({ data: [] }))
    const gen = createOpenRouterGenerator({ apiKey: 'k', model: 'openai/gpt-image-1-mini', fetchImpl })
    await expect(gen.generate(request)).rejects.toMatchObject({ kind: 'bad-request', status: 402 })
    await expect(gen.generate(request)).rejects.toMatchObject({ kind: 'bad-response' })
  })
})

describe('OpenAI generator', () => {
  it('asks for a JPEG of the right size and quality, and estimates the cost', async () => {
    const { fetchImpl, calls } = mockFetch(json({ data: [{ b64_json: PNG }], usage: { input_tokens: 90, output_tokens: 400 } }))
    const res = await createOpenAIGenerator({ apiKey: 'sk-test', model: 'gpt-image-1-mini', fetchImpl }).generate(request)
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/images/generations')
    expect(body(calls[0]!)).toEqual({
      model: 'gpt-image-1-mini',
      prompt: 'A sheet of pictures',
      n: 1,
      size: '1536x1024',
      quality: 'low',
      output_format: 'jpeg',
      output_compression: 90,
    })
    expect(res.image.type).toBe('image/jpeg')
    expect(res.usage).toEqual({ inputTokens: 90, outputTokens: 400, costUsd: 0.006, costSource: 'estimated' })
  })

  it('lists only GPT Image models, cheapest first', async () => {
    const { fetchImpl } = mockFetch(json({ data: [{ id: 'gpt-5' }, { id: 'gpt-image-1' }, { id: 'gpt-image-1-mini' }, { id: 'gpt-image-9' }] }))
    const models = await createOpenAIGenerator({ apiKey: 'k', model: '', fetchImpl }).listModels()
    expect(models.map((m) => m.id)).toEqual(['gpt-image-1-mini', 'gpt-image-1', 'gpt-image-9'])
  })
})

describe('Gemini generator', () => {
  it('requests an image with the aspect ratio and takes the final, non-thought image', async () => {
    const { fetchImpl, calls } = mockFetch(
      json({
        candidates: [
          {
            content: {
              parts: [
                { thought: true, inlineData: { mimeType: 'image/png', data: btoa('draft') } },
                { text: 'Here you go' },
                { inlineData: { mimeType: 'image/png', data: PNG } },
              ],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 1120 },
      }),
    )
    const res = await createGeminiGenerator({ apiKey: 'AIza-test', model: 'gemini-3.1-flash-lite-image', fetchImpl }).generate(request)
    const { url, init } = calls[0]!
    expect(url).toContain('/models/gemini-3.1-flash-lite-image:generateContent')
    expect(url).not.toContain('AIza-test')
    expect(body(calls[0]!).generationConfig).toEqual({ responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '3:2' } })
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test')
    expect(await res.image.text()).toBe('fake-png-bytes')
    expect(res.usage).toEqual({ inputTokens: 80, outputTokens: 1120, costUsd: 0.0336, costSource: 'estimated' })
  })

  it('reports a refused prompt as blocked and a reply without an image as bad-response', async () => {
    const { fetchImpl } = mockFetch(json({ promptFeedback: { blockReason: 'SAFETY' } }), json({ candidates: [{ content: { parts: [{ text: 'no' }] }, finishReason: 'STOP' }] }))
    const gen = createGeminiGenerator({ apiKey: 'k', model: 'm', fetchImpl })
    await expect(gen.generate(request)).rejects.toMatchObject({ kind: 'blocked' })
    await expect(gen.generate(request)).rejects.toMatchObject({ kind: 'bad-response' })
  })

  it('lists image models that support generateContent', async () => {
    const { fetchImpl } = mockFetch(
      json({
        models: [
          { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.1-flash-lite-image', displayName: 'Lite image', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/imagen-5', supportedGenerationMethods: ['predict'] },
        ],
      }),
    )
    const models = await createGeminiGenerator({ apiKey: 'k', model: '', fetchImpl }).listModels()
    expect(models.map((m) => m.id)).toEqual(['gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image'])
  })
})
