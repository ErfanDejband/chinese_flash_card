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
