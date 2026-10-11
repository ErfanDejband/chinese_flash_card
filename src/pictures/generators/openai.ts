import { requestJson } from '@/import/ai/http'
import type { FetchLike, ModelInfo } from '@/import/ai/types'
import { costFromUsage } from '../estimate'
import type { PictureGenerator, SheetRequest, SheetResult } from '../types'
import { base64ToBlob, noImage } from './common'

export const OPENAI_BASE_URL = 'https://api.openai.com/v1'

/** Cheapest first: the model a new setup starts with is the first one the key can use. */
export const OPENAI_IMAGE_MODELS = ['gpt-image-1-mini', 'gpt-image-2', 'gpt-image-1.5', 'gpt-image-1']

interface ImagesResponse {
  data?: { b64_json?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

/** OpenAI's Image API (`POST /images/generations`) with GPT Image models. */
export function createOpenAIGenerator(opts: { apiKey: string; model: string; fetchImpl?: FetchLike }): PictureGenerator {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` }

  return {
    label: 'OpenAI',

    async listModels(signal) {
      const body = (await requestJson(fetchImpl, `${OPENAI_BASE_URL}/models`, { headers, signal })) as { data?: { id?: string }[] }
      const ids = (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string' && id.startsWith('gpt-image'))
      const rank = (id: string) => (OPENAI_IMAGE_MODELS.indexOf(id) + OPENAI_IMAGE_MODELS.length + 1) % (OPENAI_IMAGE_MODELS.length + 1)
      return ids.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((id): ModelInfo => ({ id, label: id }))
    },

    async generate(req: SheetRequest): Promise<SheetResult> {
      const res = (await requestJson(fetchImpl, `${OPENAI_BASE_URL}/images/generations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: opts.model,
          prompt: req.prompt,
          n: 1,
          size: req.aspect === '3:2' ? '1536x1024' : '1024x1024',
          quality: req.quality,
          output_format: 'jpeg',
          output_compression: 90,
        }),
        signal: req.signal,
      })) as ImagesResponse
      const b64 = res.data?.[0]?.b64_json
      if (!b64) throw noImage('OpenAI')
      const costUsd = costFromUsage('openai', opts.model, req.aspect, req.quality)
      return {
        image: base64ToBlob(b64, 'image/jpeg'),
        model: opts.model,
        usage: {
          inputTokens: res.usage?.input_tokens ?? 0,
          outputTokens: res.usage?.output_tokens ?? 0,
          ...(costUsd !== undefined ? { costUsd, costSource: 'estimated' as const } : {}),
        },
      }
    },
  }
}
