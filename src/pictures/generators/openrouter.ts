import { requestJson } from '@/import/ai/http'
import { OPENROUTER_BASE_URL } from '@/import/ai/openrouterAuth'
import type { FetchLike, ModelInfo } from '@/import/ai/types'
import type { PictureGenerator, SheetRequest, SheetResult } from '../types'
import { base64ToBlob, noImage } from './common'

type Param = { type?: string; values?: string[] }

interface ImageModel {
  id?: string
  name?: string
  supported_parameters?: Record<string, Param>
}

interface ImagesResponse {
  data?: { b64_json?: string; media_type?: string }[]
  model?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
}

/**
 * OpenRouter's Image API (`POST /images`): one key for many image models. Each model accepts
 * its own set of parameters (`GET /images/models`), so only supported ones are sent.
 * OpenRouter reports the cost of every request.
 */
export function createOpenRouterGenerator(opts: { apiKey: string; model: string; baseUrl?: string; fetchImpl?: FetchLike }): PictureGenerator {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  const base = (opts.baseUrl ?? OPENROUTER_BASE_URL).replace(/\/+$/, '')
  const headers: Record<string, string> = { 'content-type': 'application/json', 'X-OpenRouter-Title': 'Mandarin Leitner' }
  if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`
  let models: Promise<ImageModel[]> | undefined
  const loadModels = (signal?: AbortSignal) =>
    (models ??= (requestJson(fetchImpl, `${base}/images/models`, { headers, signal }) as Promise<{ data?: ImageModel[] }>).then((b) => b.data ?? []))

  return {
    label: 'OpenRouter',

    async listModels(signal) {
      const list = await loadModels(signal)
      return list
        .filter((m): m is ImageModel & { id: string } => typeof m.id === 'string')
        .map((m): ModelInfo => ({ id: m.id, label: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id }))
    },

    async generate(req: SheetRequest): Promise<SheetResult> {
      let params: Record<string, Param> = {}
      try {
        params = (await loadModels(req.signal)).find((m) => m.id === opts.model)?.supported_parameters ?? {}
      } catch {
        // Without the capability list, send only what every model takes.
      }
      const allows = (name: string, value: string) => params[name]?.values?.includes(value) ?? false
      const body: Record<string, unknown> = { model: opts.model, prompt: req.prompt, n: 1 }
      if (allows('aspect_ratio', req.aspect) || !params.aspect_ratio) body.aspect_ratio = req.aspect
      if (allows('quality', req.quality)) body.quality = req.quality
      if (allows('resolution', '1K')) body.resolution = '1K'
      if (allows('output_format', 'jpeg')) body.output_format = 'jpeg'

      const res = (await requestJson(fetchImpl, `${base}/images`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: req.signal,
      })) as ImagesResponse
      const image = res.data?.find((d) => d.b64_json)
      if (!image?.b64_json) throw noImage('OpenRouter')
      const u = res.usage
      return {
        image: base64ToBlob(image.b64_json, image.media_type ?? 'image/png'),
        model: res.model ?? opts.model,
        usage: u && {
          inputTokens: u.prompt_tokens ?? 0,
          outputTokens: u.completion_tokens ?? 0,
          ...(typeof u.cost === 'number' ? { costUsd: u.cost, costSource: 'reported' as const } : {}),
        },
      }
    },
  }
}
