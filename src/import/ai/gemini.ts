import { requestJson } from './http'
import { GEMINI_RESPONSE_SCHEMA, SYSTEM_PROMPT, userPrompt } from './prompt'
import { ProviderError, type FetchLike, type ModelInfo, type PageRequest, type PageResponse, type VisionProvider } from './types'

export const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta'

interface GeminiModel {
  name?: string
  displayName?: string
  supportedGenerationMethods?: string[]
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  modelVersion?: string
}

const BLOCKING_FINISH = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY'])

/**
 * Gemini generateContent over REST. The key travels in the `x-goog-api-key` header,
 * never in the URL.
 */
export function createGeminiProvider(opts: { apiKey: string; model: string; fetchImpl?: FetchLike }): VisionProvider {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  const headers = { 'x-goog-api-key': opts.apiKey, 'content-type': 'application/json' }

  return {
    label: 'Google Gemini',

    async listModels(signal) {
      const models: ModelInfo[] = []
      let pageToken = ''
      do {
        const url = `${GEMINI_API}/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
        const body = (await requestJson(fetchImpl, url, { headers, signal })) as { models?: GeminiModel[]; nextPageToken?: string }
        for (const m of body.models ?? []) {
          if (!m.name || !m.supportedGenerationMethods?.includes('generateContent')) continue
          const id = m.name.replace(/^models\//, '')
          models.push({ id, label: m.displayName ? `${m.displayName} (${id})` : id })
        }
        pageToken = body.nextPageToken ?? ''
      } while (pageToken)
      return models
    },

    async extractPage(req: PageRequest): Promise<PageResponse> {
      const body = {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType: req.mime, data: req.imageBase64 } }, { text: userPrompt(req.textHint) }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      }
      const url = `${GEMINI_API}/models/${encodeURIComponent(opts.model)}:generateContent`
      const res = (await requestJson(fetchImpl, url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: req.signal,
      })) as GeminiResponse

      if (res.promptFeedback?.blockReason) {
        throw new ProviderError('blocked', `Gemini refused the page (${res.promptFeedback.blockReason}).`)
      }
      const candidate = res.candidates?.[0]
      if (candidate?.finishReason && BLOCKING_FINISH.has(candidate.finishReason)) {
        throw new ProviderError('blocked', `Gemini stopped (${candidate.finishReason}).`)
      }
      const text = (candidate?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('')
      if (!text) {
        const reason = candidate?.finishReason ? ` (${candidate.finishReason})` : ''
        throw new ProviderError('bad-response', `Gemini returned no text${reason}.`)
      }
      return { text, model: res.modelVersion ?? opts.model }
    },
  }
}

/**
 * Default Gemini model: the newest stable "gemini-X.Y-flash" (not lite, not preview); otherwise the
 * `gemini-flash-latest` alias; otherwise any flash model; otherwise the first model.
 */
export function pickDefaultGeminiModel(models: ModelInfo[]): string | undefined {
  const version = (id: string) => {
    const m = /^gemini-(\d+(?:\.\d+)?)-flash$/.exec(id)
    return m ? Number(m[1]) : undefined
  }
  const stable = models
    .map((m) => ({ id: m.id, v: version(m.id) }))
    .filter((m): m is { id: string; v: number } => m.v !== undefined)
    .sort((a, b) => b.v - a.v)
  return (
    stable[0]?.id ??
    models.find((m) => m.id === 'gemini-flash-latest')?.id ??
    models.find((m) => /flash/.test(m.id) && !/lite|image|tts|live|audio/.test(m.id))?.id ??
    models[0]?.id
  )
}
