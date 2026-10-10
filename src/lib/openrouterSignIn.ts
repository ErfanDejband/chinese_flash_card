import { createPkce, exchangeOpenRouterCode, openRouterAuthUrl, randomToken } from '@/import/ai/openrouterAuth'
import type { FetchLike } from '@/import/ai/types'
import { getAiSettings, saveAiSettings } from './aiConfig'

/**
 * Browser side of "Sign in with OpenRouter". The pending sign-in is kept in localStorage, not
 * sessionStorage: an installed Android app may get the redirect back in a browser tab, which
 * shares localStorage but not sessionStorage.
 */
const PENDING_KEY = 'mandarin-leitner.openrouter-pending'
const MAX_AGE_MS = 15 * 60_000

export interface PendingSignIn {
  verifier: string
  state: string
  /** App route to show afterwards, e.g. `/settings`. */
  returnTo: string
  createdAt: number
}

export type SignInStatus = { kind: 'idle' } | { kind: 'connecting' } | { kind: 'error'; message: string }

let status: SignInStatus = { kind: 'idle' }
const listeners = new Set<() => void>()

function setStatus(next: SignInStatus) {
  status = next
  listeners.forEach((l) => l())
}

export function getSignInStatus(): SignInStatus {
  return status
}

export function subscribeSignInStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The app's root without the hash; OpenRouter appends `?code=…&state=…`. */
export function callbackUrl(): string {
  return `${location.origin}${import.meta.env.BASE_URL}`
}

/** Leaves the app for openrouter.ai; it comes back through `handleOpenRouterCallback`. */
export async function startOpenRouterSignIn(returnTo: string): Promise<void> {
  try {
    const { verifier, challenge } = await createPkce()
    const state = randomToken(16)
    const pending: PendingSignIn = { verifier, state, returnTo, createdAt: Date.now() }
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
    location.assign(openRouterAuthUrl({ callbackUrl: callbackUrl(), challenge, state }))
  } catch {
    setStatus({ kind: 'error', message: 'Could not start the sign-in (is browser storage blocked?).' })
  }
}

function readPending(): PendingSignIn | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as PendingSignIn | null
    return value && typeof value.verifier === 'string' && typeof value.state === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

export type CallbackMatch = { kind: 'ok'; code: string; pending: PendingSignIn } | { kind: 'mismatch' } | { kind: 'none' }

/**
 * Is this page load OpenRouter's redirect for a sign-in this device started? A `?code` without a
 * pending sign-in is not ours; a wrong `state` or an old attempt is refused.
 */
export function matchCallback(search: string, pending: PendingSignIn | undefined, now: number): CallbackMatch {
  const params = new URLSearchParams(search)
  const code = params.get('code')
  if (!code || !pending) return { kind: 'none' }
  if (params.get('state') !== pending.state || now - pending.createdAt > MAX_AGE_MS) return { kind: 'mismatch' }
  return { kind: 'ok', code, pending }
}

/**
 * Call once at startup, before the router renders. Returns the route to show when this load
 * finishes a sign-in; the key exchange then runs in the background (see `getSignInStatus`).
 */
export function handleOpenRouterCallback(fetchImpl?: FetchLike): string | undefined {
  const match = matchCallback(location.search, readPending(), Date.now())
  if (match.kind === 'none') return undefined

  // The code is single-use: drop it from the address bar and history, and forget the attempt.
  const params = new URLSearchParams(location.search)
  params.delete('code')
  params.delete('state')
  const rest = params.toString()
  history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`)
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // Storage blocked: the attempt expires on its own.
  }

  if (match.kind === 'mismatch') {
    setStatus({ kind: 'error', message: 'That sign-in could not be verified (it may be too old). Please connect again.' })
    return '/settings'
  }

  setStatus({ kind: 'connecting' })
  exchangeOpenRouterCode(match.code, match.pending.verifier, fetchImpl).then(
    (key) => {
      saveAiSettings({ ...getAiSettings(), mode: 'free', free: { apiKey: key } })
      setStatus({ kind: 'idle' })
    },
    (e: unknown) => setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Could not finish the sign-in.' }),
  )
  return match.pending.returnTo.startsWith('/') ? match.pending.returnTo : '/settings'
}

/** Forget the OpenRouter key on this device (the key itself is revoked on openrouter.ai). */
export function disconnectOpenRouter(): void {
  saveAiSettings({ ...getAiSettings(), free: { apiKey: '' } })
  setStatus({ kind: 'idle' })
}
