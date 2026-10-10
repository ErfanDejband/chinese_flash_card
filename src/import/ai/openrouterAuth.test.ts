import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createPkce, exchangeOpenRouterCode, openRouterAuthUrl, openRouterFreeQuota, pkceChallenge, randomToken } from './openrouterAuth'
import { ProviderError, type FetchLike } from './types'

function mockFetch(...responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl: FetchLike = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} })
    const next = responses.shift()
    if (!next) throw new Error('unexpected request')
    return next
  })
  return { fetchImpl, calls }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('OpenRouter PKCE', () => {
  it('makes URL-safe verifiers and S256 challenges', async () => {
    for (let i = 0; i < 5; i++) {
      const { verifier, challenge } = await createPkce()
      expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
    }
    expect(randomToken()).not.toBe(randomToken())
  })

  it('matches Node for a fixed verifier', async () => {
    const v = 'test-verifier-0123456789-abcdefghijklmnopqrstuvwxyz'
    expect(await pkceChallenge(v)).toBe(createHash('sha256').update(v).digest('base64url'))
  })

  it('builds the auth URL', () => {
    const url = new URL(openRouterAuthUrl({ callbackUrl: 'https://example.github.io/app/', challenge: 'CH', state: 'ST' }))
    expect(url.origin + url.pathname).toBe('https://openrouter.ai/auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      callback_url: 'https://example.github.io/app/',
      code_challenge: 'CH',
      code_challenge_method: 'S256',
      key_label: 'Mandarin Leitner',
      state: 'ST',
    })
  })
})

describe('OpenRouter key exchange', () => {
  it('posts the code and verifier and returns the key', async () => {
    const { fetchImpl, calls } = mockFetch(json({ key: 'sk-or-v1-made-up' }))
    expect(await exchangeOpenRouterCode('CODE', 'VERIFIER', fetchImpl)).toBe('sk-or-v1-made-up')
    expect(calls[0]!.url).toBe('https://openrouter.ai/api/v1/auth/keys')
    expect(calls[0]!.init.method).toBe('POST')
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ code: 'CODE', code_verifier: 'VERIFIER', code_challenge_method: 'S256' })
  })

  it('explains an expired, reused or invalid code', async () => {
    const { fetchImpl } = mockFetch(
      json({ error: { message: 'Authorization code expired' } }, 403),
      json({ error: { message: 'Invalid code', code: 400 } }, 400), // what OpenRouter returns for an unknown code
    )
    await expect(exchangeOpenRouterCode('C', 'V', fetchImpl)).rejects.toThrow('The sign-in could not be completed (Authorization code expired)')
    await expect(exchangeOpenRouterCode('C', 'V', fetchImpl)).rejects.toMatchObject({ kind: 'auth', message: expect.stringContaining('(Invalid code)') })
  })

  it('rejects a reply without a key', async () => {
    const { fetchImpl } = mockFetch(json({}))
    await expect(exchangeOpenRouterCode('C', 'V', fetchImpl)).rejects.toBeInstanceOf(ProviderError)
  })
})

describe('OpenRouter free quota', () => {
  it('reads the daily free-model requests with the key', async () => {
    const { fetchImpl, calls } = mockFetch(json({ data: { is_free_tier: true, free_model_daily_requests: { used: 8, limit: 50, remaining: 42 } } }))
    expect(await openRouterFreeQuota('sk-or-v1-made-up', fetchImpl)).toEqual({ used: 8, limit: 50, remaining: 42 })
    expect(calls[0]!.url).toBe('https://openrouter.ai/api/v1/key')
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer sk-or-v1-made-up')
  })

  it('derives what is missing, and returns undefined when nothing is reported', async () => {
    const { fetchImpl } = mockFetch(json({ data: { free_model_daily_requests: { used: 10, limit: 50 } } }), json({ data: { label: 'x' } }))
    expect(await openRouterFreeQuota('k', fetchImpl)).toEqual({ used: 10, limit: 50, remaining: 40 })
    expect(await openRouterFreeQuota('k', fetchImpl)).toBeUndefined()
  })
})
