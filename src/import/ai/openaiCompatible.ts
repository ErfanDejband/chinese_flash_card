import { requestJson } from './http'
import { JSON_SHAPE, SYSTEM_PROMPT, userPrompt } from './prompt'
import { ProviderError, type FetchLike, type PageRequest, type PageResponse, type VisionProvider } from './types'

export interface OpenAIPreset {
  id: string
  label: string
  baseUrl: string
}

export const OPENAI_PRESETS: OpenAIPreset[] = [
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'custom', label: 'Custom (LM Studio, Ollama, …)', baseUrl: '' },
]

interface ListedModel {
  id?: string
  name?: string
  architecture?: { input_modalities?: string[] }
  pricing?: { prompt?: string; completion?: string }
}

interface ChatResponse {
  choices?: { message?: { content?: string | { type?: string; text?: string }[] | null }; finish_reason?: string }[]
  model?: string
}

function messageText(content: string | { type?: string; text?: string }[] | null | undefined): string {
  if (typeof content === 'string') return content
  return (content ?? []).map((p) => p.text ?? '').join('')
}

/** Any OpenAI-style `chat/completions` endpoint (OpenRouter, Groq, OpenAI, LM Studio, Ollama). */
export function createOpenAICompatibleProvider(opts: {
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: FetchLike
}): VisionProvider {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  const base = opts.baseUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`
  if (base.includes('openrouter.ai')) headers['X-OpenRouter-Title'] = 'Mandarin Leitner'

  async function complete(req: PageRequest, jsonMode: boolean): Promise<ChatResponse> {
    const body = {
      model: opts.model,
      temperature: 0,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\n${JSON_SHAPE}` },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt(req.textHint) },
            { type: 'image_url', image_url: { url: `data:${req.mime};base64,${req.imageBase64}` } },
          ],
        },
      ],
    }
    return (await requestJson(fetchImpl, `${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: req.signal,
    })) as ChatResponse
  }

  return {
    label: base,

    async listModels(signal) {
      const body = (await requestJson(fetchImpl, `${base}/models`, { headers, signal })) as { data?: ListedModel[] }
      return (body.data ?? [])
        .filter((m): m is ListedModel & { id: string } => typeof m.id === 'string')
        .map((m) => ({
          id: m.id,
          label: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id,
          vision: m.architecture?.input_modalities ? m.architecture.input_modalities.includes('image') : undefined,
          free: m.id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0'),
        }))
    },

    async extractPage(req: PageRequest): Promise<PageResponse> {
      let res: ChatResponse
      try {
        res = await complete(req, true)
      } catch (e) {
        // Some models/endpoints reject response_format: retry once without it (the prompt still asks for JSON).
        if (e instanceof ProviderError && e.kind === 'bad-request' && /response_format|json/i.test(e.message)) {
          res = await complete(req, false)
        } else {
          throw e
        }
      }
      const text = messageText(res.choices?.[0]?.message?.content)
      if (!text) throw new ProviderError('bad-response', 'The model returned no text.')
      return { text, model: res.model ?? opts.model }
    },
  }
}
