import { GEMINI_API } from '@/import/ai/gemini'
import { requestJson } from '@/import/ai/http'
import { ProviderError, type FetchLike, type ModelInfo } from '@/import/ai/types'
import { costFromUsage } from '../estimate'
import type { PictureGenerator, SheetRequest, SheetResult } from '../types'
import { base64ToBlob, noImage } from './common'

/** Cheapest first. */
export const GEMINI_IMAGE_MODELS = ['gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1', 'gemini-3.1-flash-image', 'gemini-3-pro-image']

interface GeminiImageResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean; inlineData?: { mimeType?: string; data?: string } }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  modelVersion?: string
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
}

/** Gemini image models through `generateContent` with an image response. The key goes in a header. */
export function createGeminiGenerator(opts: { apiKey: string; model: string; fetchImpl?: FetchLike }): PictureGenerator {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  const headers = { 'x-goog-api-key': opts.apiKey, 'content-type': 'application/json' }

  return {
    label: 'Google Gemini',

    async listModels(signal) {
      const body = (await requestJson(fetchImpl, `${GEMINI_API}/models?pageSize=1000`, { headers, signal })) as {
        models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[]
      }
      const models: ModelInfo[] = []
      for (const m of body.models ?? []) {
        const id = m.name?.replace(/^models\//, '')
        if (!id || !/-image\b|nano-banana/.test(id) || !m.supportedGenerationMethods?.includes('generateContent')) continue
        models.push({ id, label: m.displayName ? `${m.displayName} (${id})` : id })
      }
      const rank = (id: string) => (GEMINI_IMAGE_MODELS.indexOf(id) + GEMINI_IMAGE_MODELS.length + 1) % (GEMINI_IMAGE_MODELS.length + 1)
      return models.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))
    },

    async generate(req: SheetRequest): Promise<SheetResult> {
      const body = {
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: req.aspect } },
      }
      const res = (await requestJson(fetchImpl, `${GEMINI_API}/models/${encodeURIComponent(opts.model)}:generateContent`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: req.signal,
      })) as GeminiImageResponse
      if (res.promptFeedback?.blockReason) throw new ProviderError('blocked', `Gemini refused the picture (${res.promptFeedback.blockReason}).`)
      const candidate = res.candidates?.[0]
      // Thinking models may send draft images first; the last non-thought image is the answer.
      const image = (candidate?.content?.parts ?? []).filter((p) => !p.thought && p.inlineData?.data).at(-1)?.inlineData
      if (!image?.data) throw noImage('Gemini', candidate?.finishReason)
      const u = res.usageMetadata
      const costUsd = costFromUsage('gemini', opts.model, req.aspect, req.quality)
      return {
        image: base64ToBlob(image.data, image.mimeType ?? 'image/png'),
        model: res.modelVersion ?? opts.model,
        usage: {
          inputTokens: u?.promptTokenCount ?? 0,
          outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
          ...(costUsd !== undefined ? { costUsd, costSource: 'estimated' as const } : {}),
        },
      }
    },
  }
}
