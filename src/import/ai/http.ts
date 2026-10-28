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

/**
 * A 429 for a used-up daily allowance rather than a per-minute limit: the message says so
 * (OpenRouter "free-models-per-day", Gemini "…PerDay…"), or the limit only resets much later.
 */
function isDailyLimit(res: Response, message: string): boolean {
  if (/per[- ]?day/i.test(message)) return true
  const reset = Number(res.headers.get('x-ratelimit-reset'))
  return res.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset) && reset - Date.now() > 5 * 60_000
}

function errorMessage(body: unknown, fallback: string): string {
  const e = (body as { error?: unknown } | undefined)?.error
  if (typeof e === 'string') return e
  const m = (e as { message?: unknown } | undefined)?.message
  return typeof m === 'string' && m ? m : fallback
}

async function send(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, init)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ProviderError('network', 'Could not reach the AI service (offline, blocked, or the service does not allow browser requests).')
  }
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}

function okBody(res: Response, body: unknown): unknown {
  if (body === undefined) throw new ProviderError('bad-response', 'The AI service returned an empty or non-JSON reply.', { status: res.status })
  return body
}

function httpError(res: Response, body: unknown): ProviderError {
  const message = errorMessage(body, `${res.status} ${res.statusText}`.trim())
  const status = res.status
  if (status === 401 || status === 403) return new ProviderError('auth', `The API key was rejected: ${message}`, { status })
  if (status === 429 && isDailyLimit(res, message)) return new ProviderError('quota', `Daily limit reached: ${message}`, { status })
  if (status === 429) return new ProviderError('rate-limit', `Rate limit or quota reached: ${message}`, { status, retryAfterMs: retryAfterMs(res, body) })
  if (status >= 500) return new ProviderError('server', `The AI service had a problem: ${message}`, { status })
  return new ProviderError('bad-request', message, { status })
}

/** POST/GET JSON; maps HTTP and network failures to ProviderError. */
export async function requestJson(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<unknown> {
  const res = await send(fetchImpl, url, init)
  const body = parseJson(await res.text())
  if (res.ok) return okBody(res, body)
  throw httpError(res, body)
}

export interface StreamHandlers {
  /** The service accepted the request and is answering. */
  onOpen?(): void
  /** One event's `data`, parsed as JSON. */
  onData(data: unknown): void
}

/**
 * POST a request answered with Server-Sent Events and pass each event's JSON `data` on. Comment
 * lines (OpenRouter's `: OPENROUTER PROCESSING`) and `[DONE]` are skipped. Failures before the
 * stream are mapped as in requestJson. A reply that isn't an event stream (a local server or a
 * mock that ignores `stream`) is returned as `{ json }`; a streamed one returns undefined.
 */
export async function requestStream(fetchImpl: FetchLike, url: string, init: RequestInit, handlers: StreamHandlers): Promise<{ json: unknown } | undefined> {
  const res = await send(fetchImpl, url, init)
  if (!res.ok) throw httpError(res, parseJson(await res.text()))
  if (!res.body || !res.headers.get('content-type')?.includes('text/event-stream')) return { json: okBody(res, parseJson(await res.text())) }
  handlers.onOpen?.()

  const signal = init.signal ?? undefined
  const aborted = () => signal?.reason ?? new DOMException('Aborted', 'AbortError')
  const reader = res.body.getReader()
  const stop = () => void reader.cancel().catch(() => {})
  signal?.addEventListener('abort', stop, { once: true })
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []
  let finished = false
  const dispatch = () => {
    const payload = data.join('\n')
    data = []
    if (!payload || payload.trim() === '[DONE]') return
    const json = parseJson(payload)
    if (json !== undefined) handlers.onData(json)
  }
  const line = (l: string) => {
    if (l === '') return dispatch()
    if (l.startsWith(':')) return
    const colon = l.indexOf(':')
    if ((colon < 0 ? l : l.slice(0, colon)) === 'data') data.push(colon < 0 ? '' : l.slice(colon + 1).replace(/^ /, ''))
  }
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (e) {
        if (signal?.aborted) throw aborted()
        if (e instanceof DOMException && e.name === 'AbortError') throw e
        throw new ProviderError('network', 'The connection to the AI service broke off while it was answering.')
      }
      if (signal?.aborted) throw aborted()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      // A trailing \r may be the first half of \r\n: keep it for the next chunk.
      const end = buffer.endsWith('\r') ? buffer.length - 1 : buffer.length
      const lines = buffer.slice(0, end).split(/\r\n|\r|\n/)
      buffer = lines.pop()! + buffer.slice(end)
      lines.forEach(line)
    }
    finished = true
    buffer += decoder.decode()
    buffer.split(/\r\n|\r|\n/).forEach(line)
    dispatch()
  } finally {
    signal?.removeEventListener('abort', stop)
    // An error in the middle (thrown by onData, say): stop downloading the rest.
    if (!finished) stop()
  }
  return undefined
}

/** An error sent inside a stream (`{"error": {...}}`, as OpenRouter and Gemini do), as a ProviderError. */
export function streamedError(data: unknown): ProviderError | undefined {
  const e = (data as { error?: unknown } | undefined)?.error
  if (!e) return undefined
  const message = errorMessage(data, 'The AI service stopped while answering.')
  const code = Number((e as { code?: unknown }).code)
  const status = Number.isInteger(code) && code >= 400 ? code : undefined
  if (status === 401 || status === 403) return new ProviderError('auth', `The API key was rejected: ${message}`, { status })
  if (/per[- ]?day/i.test(message)) return new ProviderError('quota', `Daily limit reached: ${message}`, { status })
  if (status === 429 || /rate.?limit/i.test(message)) return new ProviderError('rate-limit', `Rate limit or quota reached: ${message}`, { status })
  return new ProviderError('server', `The AI service had a problem: ${message}`, { status })
}

/** Base64 without data: prefix; chunked so large images don't overflow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}
