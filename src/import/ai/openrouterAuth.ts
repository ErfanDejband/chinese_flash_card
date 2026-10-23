import { bytesToBase64, requestJson } from './http'
import { ProviderError, type FetchLike } from './types'

/**
 * "Sign in with OpenRouter" (OAuth PKCE): the user authorises the app on openrouter.ai and comes
 * back with a one-time `?code=`, which the app exchanges for the user's own API key. No backend,
 * client registration or secret. See docs/adr/0006.
 */
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
/** OpenRouter's router over its free models: it only picks models that support the request (image input, JSON). */
export const FREE_ROUTER_MODEL = 'openrouter/free'
const AUTH_URL = 'https://openrouter.ai/auth'

const defaultFetch: FetchLike = (input, init) => fetch(input, init)

const base64url = (bytes: Uint8Array) => bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** URL-safe random string (32 bytes → 43 characters). */
export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

/** S256 challenge: base64url(SHA-256(verifier)). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken()
  return { verifier, challenge: await pkceChallenge(verifier) }
}

export function openRouterAuthUrl(opts: { callbackUrl: string; challenge: string; state: string }): string {
  const params = new URLSearchParams({
    callback_url: opts.callbackUrl,
    code_challenge: opts.challenge,
    code_challenge_method: 'S256',
    key_label: 'Mandarin Leitner',
    state: opts.state,
  })
  return `${AUTH_URL}?${params}`
}

/** One-time code (valid 10 minutes) → the user's `sk-or-…` key. */
export async function exchangeOpenRouterCode(code: string, verifier: string, fetchImpl: FetchLike = defaultFetch): Promise<string> {
  let body: unknown
  try {
    body = await requestJson(fetchImpl, `${OPENROUTER_BASE_URL}/auth/keys`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
    })
  } catch (e) {
    // 400 "Invalid code", 403 "Authorization code expired" / "Invalid code or code_verifier".
    if (e instanceof ProviderError && (e.status === 400 || e.status === 403)) {
      const reason = e.message.replace(/^The API key was rejected: /, '')
      throw new ProviderError('auth', `The sign-in could not be completed (${reason}): it may have expired or been used already. Please connect again.`, {
        status: e.status,
      })
    }
    throw e
  }
  const key = (body as { key?: unknown }).key
  if (typeof key !== 'string' || !key) throw new ProviderError('bad-response', 'OpenRouter did not return a key.')
  return key
}

export interface FreeQuota {
  used: number
  limit: number
  remaining: number
}

/** Today's free-model requests of this key; undefined when OpenRouter doesn't report them. */
export async function openRouterFreeQuota(apiKey: string, fetchImpl: FetchLike = defaultFetch, signal?: AbortSignal): Promise<FreeQuota | undefined> {
  const body = (await requestJson(fetchImpl, `${OPENROUTER_BASE_URL}/key`, { headers: { authorization: `Bearer ${apiKey}` }, signal })) as {
    data?: { free_model_daily_requests?: Partial<FreeQuota> }
    free_model_daily_requests?: Partial<FreeQuota>
  }
  const q = body.data?.free_model_daily_requests ?? body.free_model_daily_requests
  if (!q || typeof q.limit !== 'number') return undefined
  const used = typeof q.used === 'number' ? q.used : 0
  const remaining = typeof q.remaining === 'number' ? q.remaining : Math.max(0, q.limit - used)
  return { used, limit: q.limit, remaining }
}

/** OpenRouter's own numbers for one request (`GET /generation`), for the import trace. */
export interface GenerationStats {
  /**
   * Time to the first token (queueing, upload, reading the prompt). OpenRouter's docs call it
   * "total latency", but measured values are well below `generationMs` (0.4 s vs 43 s).
   */
  latencyMs?: number
  /** Time the model spent generating, thinking included: nearly all of a non-streamed request. */
  generationMs?: number
  provider?: string
  model?: string
  promptTokens?: number
  completionTokens?: number
  reasoningTokens?: number
  finishReason?: string
  /** Every upstream attempt OpenRouter made (fallbacks included), with its HTTP status. */
  upstream?: { provider?: string; status?: number; latencyMs?: number }[]
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

/** Stats of a finished request, by the `id` of its reply; OpenRouter has them a few seconds after it ends. */
export async function openRouterGenerationStats(
  apiKey: string,
  id: string,
  fetchImpl: FetchLike = defaultFetch,
  signal?: AbortSignal,
): Promise<GenerationStats> {
  const body = (await requestJson(fetchImpl, `${OPENROUTER_BASE_URL}/generation?id=${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal,
  })) as { data?: Record<string, unknown> }
  const d = body.data ?? {}
  const upstream = Array.isArray(d.provider_responses)
    ? (d.provider_responses as Record<string, unknown>[]).map((r) => ({ provider: str(r.provider_name), status: num(r.status), latencyMs: num(r.latency) }))
    : undefined
  return {
    latencyMs: num(d.latency),
    generationMs: num(d.generation_time),
    provider: str(d.provider_name),
    model: str(d.model),
    promptTokens: num(d.native_tokens_prompt),
    completionTokens: num(d.native_tokens_completion),
    reasoningTokens: num(d.native_tokens_reasoning),
    finishReason: str(d.finish_reason),
    upstream,
  }
}
