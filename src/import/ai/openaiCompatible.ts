import { requestJson, requestStream, streamedError } from './http'
import { VOCAB_TASK } from './prompt'
import { ProviderError, type FetchLike, type ModelInfo, type PageRequest, type PageResponse, type StreamProgress, type VisionProvider } from './types'

interface ListedModel {
  id?: string
  name?: string
  architecture?: { input_modalities?: string[] }
  pricing?: { prompt?: string; completion?: string }
}

interface ChatResponse {
  id?: string
  /** OpenRouter: the provider that served the request. */
  provider?: string
  choices?: { message?: { content?: string | { type?: string; text?: string }[] | null }; finish_reason?: string }[]
  model?: string
  /** `cost` is reported by some services (e.g. OpenRouter, in USD credits). */
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; completion_tokens_details?: { reasoning_tokens?: number } }
}

/** One event of a streamed reply. */
interface ChatChunk {
  id?: string
  provider?: string
  model?: string
  choices?: {
    delta?: {
      content?: string | { type?: string; text?: string }[] | null
      /** OpenRouter's reasoning text; `reasoning_content` elsewhere (DeepSeek, vLLM, LM Studio). */
      reasoning?: string | null
      reasoning_content?: string | null
      reasoning_details?: { text?: string; summary?: string }[]
    }
    finish_reason?: string | null
  }[]
  /** Sent in the last event (`stream_options.include_usage`); Groq has sent it under `x_groq`. */
  usage?: ChatResponse['usage']
  x_groq?: { usage?: ChatResponse['usage'] }
  error?: unknown
}

function messageText(content: string | { type?: string; text?: string }[] | null | undefined): string {
  if (typeof content === 'string') return content
  return (content ?? []).map((p) => p.text ?? '').join('')
}

/** About four characters per token: a running count for reasoning text until the service reports the real one. */
const estimateTokens = (chars: number) => Math.round(chars / 4)

/** Any OpenAI-style `chat/completions` endpoint (OpenRouter, Groq, OpenAI, LM Studio, Ollama). */
export function createOpenAICompatibleProvider(opts: {
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: FetchLike
  /** Extra request fields, e.g. OpenRouter's `reasoning` (the free-model test uses it). */
  extraBody?: Record<string, unknown>
}): VisionProvider {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  const base = opts.baseUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`
  if (base.includes('openrouter.ai')) headers['X-OpenRouter-Title'] = 'Mandarin Leitner'

  async function complete(req: PageRequest, jsonMode: boolean, stream: boolean): Promise<ChatResponse> {
    const task = req.task ?? VOCAB_TASK
    const image = req.imageBase64
      ? [{ type: 'image_url', image_url: { url: `data:${req.mime ?? 'image/jpeg'};base64,${req.imageBase64}` } }]
      : []
    const body = {
      model: opts.model,
      temperature: 0,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
      ...opts.extraBody,
      messages: [
        { role: 'system', content: `${task.system}\n\n${task.jsonShape}` },
        { role: 'user', content: [{ type: 'text', text: task.user(req.textHint) }, ...image] },
      ],
    }
    const url = `${base}/chat/completions`
    const init = { method: 'POST', headers, body: JSON.stringify(body), signal: req.signal }
    if (stream && req.onProgress) return streamCompletion(url, init, req.onProgress)
    return (await requestJson(fetchImpl, url, init)) as ChatResponse
  }

  /** A streamed reply, put back together in the shape of a plain one (usage and ids come with the events). */
  async function streamCompletion(url: string, init: RequestInit, onProgress: (p: StreamProgress) => void): Promise<ChatResponse> {
    const res: ChatResponse = {}
    let text = ''
    let reasoningChars = 0
    let finishReason: string | undefined
    const plain = await requestStream(fetchImpl, url, init, {
      onOpen: () => onProgress({ phase: 'thinking', text: '' }),
      onData(data) {
        const chunk = data as ChatChunk
        const error = streamedError(chunk)
        if (error) throw error
        res.id ??= chunk.id
        res.provider ??= chunk.provider
        res.model ??= chunk.model
        const usage = chunk.usage ?? chunk.x_groq?.usage
        if (usage) res.usage = usage
        const choice = chunk.choices?.[0]
        if (!choice) return
        if (choice.finish_reason === 'error') throw new ProviderError('server', 'The model stopped with an error while answering.')
        if (choice.finish_reason) finishReason = choice.finish_reason
        const delta = choice.delta ?? {}
        const reasoning = delta.reasoning ?? delta.reasoning_content ?? (delta.reasoning_details ?? []).map((d) => d.text ?? d.summary ?? '').join('')
        const content = messageText(delta.content)
        reasoningChars += reasoning.length
        text += content
        if (!content && !reasoning) return
        onProgress({ phase: text ? 'writing' : 'thinking', ...(reasoningChars > 0 && { reasoningTokens: estimateTokens(reasoningChars) }), text })
      },
    })
    if (plain) return plain.json as ChatResponse
    return { ...res, choices: [{ message: { content: text }, ...(finishReason && { finish_reason: finishReason }) }] }
  }

  return {
    label: base,

    async listModels(signal) {
      const body = (await requestJson(fetchImpl, `${base}/models`, { headers, signal })) as { data?: ListedModel[] }
      const models = (body.data ?? [])
        .filter((m): m is ListedModel & { id: string } => typeof m.id === 'string')
        .map((m) => ({
          id: m.id,
          label: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id,
          vision: m.architecture?.input_modalities ? m.architecture.input_modalities.includes('image') : undefined,
          free: m.id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0'),
        }))
      // Free models that accept images first, then other image models, then the rest.
      const rank = (m: ModelInfo) => (m.vision === false ? 2 : m.free ? 0 : 1)
      return models.sort((a, b) => rank(a) - rank(b))
    },

    async extractPage(req: PageRequest): Promise<PageResponse> {
      let res: ChatResponse
      let jsonMode = true
      let stream = req.onProgress !== undefined
      for (;;) {
        try {
          res = await complete(req, jsonMode, stream)
          break
        } catch (e) {
          if (!(e instanceof ProviderError && e.kind === 'bad-request')) throw e
          // Some models/endpoints reject response_format: retry once without it (the prompt still asks for JSON).
          if (jsonMode && /response_format|json/i.test(e.message)) jsonMode = false
          // Some local servers reject streaming options: ask for a plain reply instead.
          else if (stream && /stream/i.test(e.message)) stream = false
          else throw e
        }
      }
      const jsonFallback = !jsonMode
      const text = messageText(res.choices?.[0]?.message?.content)
      if (!text) throw new ProviderError('bad-response', 'The model returned no text.')
      const u = res.usage
      const reasoningTokens = u?.completion_tokens_details?.reasoning_tokens
      const finishReason = res.choices?.[0]?.finish_reason
      return {
        text,
        model: res.model ?? opts.model,
        usage: u && {
          inputTokens: u.prompt_tokens ?? 0,
          outputTokens: u.completion_tokens ?? 0,
          ...(typeof u.cost === 'number' ? { costUsd: u.cost, costSource: 'reported' as const } : {}),
        },
        meta: {
          ...(res.id && { id: res.id }),
          ...(res.provider && { provider: res.provider }),
          ...(typeof reasoningTokens === 'number' && { reasoningTokens }),
          ...(finishReason && { finishReason }),
          ...(jsonFallback && { jsonFallback }),
        },
      }
    },
  }
}
