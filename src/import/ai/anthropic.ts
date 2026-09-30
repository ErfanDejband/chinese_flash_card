import type Anthropic from '@anthropic-ai/sdk'
import { estimateClaudeCostUsd } from './pricing'
import { JSON_RESPONSE_SCHEMA, SYSTEM_PROMPT, userPrompt } from './prompt'
import { ProviderError, type FetchLike, type ModelInfo, type PageRequest, type PageResponse, type VisionProvider } from './types'

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5'

/** Models with safety classifiers that can decline; server-side fallbacks re-run a declined request. */
const FALLBACK_MODELS = /^claude-(opus-5|fable-5)/

type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

/** Map SDK errors to the pipeline's ProviderError (our runner owns retries and shows the waiting). */
async function mapErrors<T>(call: () => Promise<T>): Promise<T> {
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk')
  try {
    return await call()
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    if (e instanceof AnthropicSdk.APIUserAbortError) throw new DOMException('Aborted', 'AbortError')
    if (e instanceof AnthropicSdk.APIConnectionError) {
      throw new ProviderError('network', 'Could not reach the Claude API (offline or blocked).')
    }
    if (e instanceof AnthropicSdk.APIError) {
      const status = e.status
      // The SDK message embeds the raw JSON body; show the API's own message instead.
      const apiMessage = (e.error as { error?: { message?: unknown } } | undefined)?.error?.message
      const message = typeof apiMessage === 'string' ? apiMessage : e.message
      if (status === 401 || status === 403) throw new ProviderError('auth', `The API key was rejected: ${message}`, { status })
      if (status === 429) {
        const seconds = Number(e.headers?.get('retry-after'))
        throw new ProviderError('rate-limit', `Rate limit or quota reached: ${message}`, {
          status,
          retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
        })
      }
      if (status !== undefined && status >= 500) throw new ProviderError('server', `The Claude API had a problem: ${message}`, { status })
      throw new ProviderError('bad-request', message, { status })
    }
    throw e
  }
}

/**
 * Claude via the official SDK, called directly from the browser with the user's own key
 * (`dangerouslyAllowBrowser`: this is a single-user app and the key never leaves the device
 * except to Anthropic). The SDK is imported on first use so it stays out of the main bundle.
 */
export function createAnthropicProvider(opts: { apiKey: string; model: string; fetchImpl?: FetchLike }): VisionProvider {
  let client: Promise<Anthropic> | undefined
  const getClient = () =>
    (client ??= import('@anthropic-ai/sdk').then(
      ({ default: AnthropicSdk }) =>
        new AnthropicSdk({
          apiKey: opts.apiKey,
          dangerouslyAllowBrowser: true,
          maxRetries: 0,
          ...(opts.fetchImpl ? { fetch: opts.fetchImpl as typeof fetch } : {}),
        }),
    ))

  return {
    label: 'Claude',

    async listModels(signal) {
      const anthropic = await getClient()
      return mapErrors(async () => {
        const models: ModelInfo[] = []
        for await (const m of anthropic.models.list({ limit: 100 }, { signal })) {
          const caps = m.capabilities
          // Keep models that accept images and support structured outputs (unknown capabilities are kept).
          if (caps && (!caps.image_input.supported || !caps.structured_outputs.supported)) continue
          models.push({ id: m.id, label: m.display_name ? `${m.display_name} (${m.id})` : m.id, vision: true })
        }
        return models
      })
    },

    async extractPage(req: PageRequest): Promise<PageResponse> {
      const anthropic = await getClient()
      const fallbacks = FALLBACK_MODELS.test(opts.model)
      const message = await mapErrors(() =>
        anthropic.beta.messages.create(
          {
            model: opts.model,
            max_tokens: 16000,
            system: SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image', source: { type: 'base64', media_type: req.mime as ImageMime, data: req.imageBase64 } },
                  { type: 'text', text: userPrompt(req.textHint) },
                ],
              },
            ],
            output_config: { format: { type: 'json_schema', schema: JSON_RESPONSE_SCHEMA } },
            ...(fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          },
          { signal: req.signal },
        ),
      )

      if (message.stop_reason === 'refusal') {
        const category = message.stop_details?.category
        throw new ProviderError('blocked', `Claude declined this page${category ? ` (${category})` : ''}.`)
      }
      if (message.stop_reason === 'max_tokens') throw new ProviderError('bad-response', 'Claude ran out of output tokens.')
      const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
      if (!text) throw new ProviderError('bad-response', 'Claude returned no text.')

      const u = message.usage
      const inputTokens = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
      const costUsd = estimateClaudeCostUsd(message.model, inputTokens, u.output_tokens)
      return {
        text,
        model: message.model,
        usage: {
          inputTokens,
          outputTokens: u.output_tokens,
          ...(costUsd !== undefined ? { costUsd, costSource: 'estimated' as const } : {}),
        },
      }
    },
  }
}
