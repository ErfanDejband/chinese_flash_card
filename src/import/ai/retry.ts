import { ModelOutputError } from './parse'
import { ProviderError } from './types'

export interface RetryOptions {
  /** Attempts for transient failures (default 4). Malformed replies are retried once. */
  maxAttempts?: number
  signal?: AbortSignal
  sleep?(ms: number, signal?: AbortSignal): Promise<void>
  random?: () => number
  /** Called before each wait, e.g. to show "rate limit reached, trying again in 20 s". */
  onWait?(ms: number, reason: 'rate limit' | 'retrying'): void
}

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/**
 * Run an AI request, retrying transient failures with backoff (honouring Retry-After) and a
 * malformed reply once. Other errors, and the last failure, are thrown as they are.
 */
export async function withRetry<T>(call: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep
  const random = opts.random ?? Math.random
  const maxAttempts = opts.maxAttempts ?? 4
  for (let attempt = 1; ; attempt++) {
    try {
      return await call()
    } catch (e) {
      if (isAbort(e)) throw e
      const badOutput = e instanceof ModelOutputError || (e instanceof ProviderError && e.kind === 'bad-response')
      const transient = e instanceof ProviderError && e.transient
      if (!(attempt < maxAttempts && (transient || (badOutput && attempt < 2)))) throw e
      const rateLimited = e instanceof ProviderError && e.kind === 'rate-limit'
      const base = rateLimited ? 10_000 : 1_000
      const ms =
        e instanceof ProviderError && e.retryAfterMs !== undefined
          ? e.retryAfterMs + 250
          : Math.round(Math.min(120_000, base * 2 ** (attempt - 1)) * (0.75 + random() / 2))
      opts.onWait?.(ms, rateLimited ? 'rate limit' : 'retrying')
      await sleep(ms, opts.signal)
    }
  }
}
