import { ProviderError, type FetchLike } from './types'

/** "31s" / "1.5s" (Google RetryInfo) → ms. */
function parseDuration(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined
  const m = /^(\d+(?:\.\d+)?)s$/.exec(v.trim())
  return m ? Math.ceil(Number(m[1]) * 1000) : undefined
}

/** Retry delay from a Retry-After header or a Google-style `error.details[].retryDelay`. */
export function retryAfterMs(res: Response, body: unknown): number | undefined {
  const header = res.headers.get('retry-after')
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds)) return Math.ceil(seconds * 1000)
    const date = Date.parse(header)
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
  }
  const details = (body as { error?: { details?: unknown } } | undefined)?.error?.details
  if (Array.isArray(details)) {
    for (const d of details) {
      const ms = parseDuration((d as { retryDelay?: unknown })?.retryDelay)
      if (ms !== undefined) return ms
    }
  }
  return undefined
}

function errorMessage(body: unknown, fallback: string): string {
  const e = (body as { error?: unknown } | undefined)?.error
  if (typeof e === 'string') return e
  const m = (e as { message?: unknown } | undefined)?.message
  return typeof m === 'string' && m ? m : fallback
}

/** POST/GET JSON; maps HTTP and network failures to ProviderError. */
export async function requestJson(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<unknown> {
  let res: Response
  try {
    res = await fetchImpl(url, init)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ProviderError('network', 'Could not reach the AI service (offline, blocked, or the service does not allow browser requests).')
  }
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = undefined
  }
  if (res.ok) {
    if (body === undefined) throw new ProviderError('bad-response', 'The AI service returned an empty or non-JSON reply.', { status: res.status })
    return body
  }
  const message = errorMessage(body, `${res.status} ${res.statusText}`.trim())
  const status = res.status
  if (status === 401 || status === 403) throw new ProviderError('auth', `The API key was rejected: ${message}`, { status })
  if (status === 429) throw new ProviderError('rate-limit', `Rate limit or quota reached: ${message}`, { status, retryAfterMs: retryAfterMs(res, body) })
  if (status >= 500) throw new ProviderError('server', `The AI service had a problem: ${message}`, { status })
  throw new ProviderError('bad-request', message, { status })
}

/** Base64 without data: prefix; chunked so large images don't overflow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}
