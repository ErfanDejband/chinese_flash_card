import { randomToken } from '@/import/ai/openrouterAuth'
import type { FetchLike } from '@/import/ai/types'
import { appRootUrl } from './appUrl'
import { GOOGLE_CLIENT_ID } from './syncConfig'

/**
 * Google sign-in for Drive sync: OAuth 2.0 for client-side web apps (`response_type=token`,
 * full-page redirect, no client secret). Google returns an access token valid for ~1 hour in
 * the URL fragment; there is no refresh token without a server, so an expired token means
 * another (usually instant) trip to Google.
 */
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
/** Only the app's own hidden folder: the app cannot see the user's other Drive files. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const SCOPES = `${DRIVE_SCOPE} email`

const PENDING_KEY = 'mandarin-leitner.google-pending'
const TOKEN_KEY = 'mandarin-leitner.google-token'
const MAX_AGE_MS = 10 * 60_000
/** Treat the token as expired a minute early so a sync never starts with a dying token. */
const EXPIRY_MARGIN_MS = 60_000

export interface PendingGoogleSignIn {
  state: string
  returnTo: string
  /** `prompt=none`: renew without any Google screen; fails if Google needs the user. */
  silent: boolean
  createdAt: number
}

export function googleAuthUrl(opts: { clientId: string; redirectUri: string; state: string; loginHint?: string; prompt?: 'none' | 'select_account' }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'token',
    scope: SCOPES,
    include_granted_scopes: 'true',
    state: opts.state,
  })
  if (opts.loginHint) params.set('login_hint', opts.loginHint)
  if (opts.prompt) params.set('prompt', opts.prompt)
  return `${AUTH_URL}?${params}`
}

/** Leaves the app for Google; it comes back through `handleGoogleCallback`. */
export function startGoogleSignIn(opts: { returnTo: string; silent?: boolean; chooseAccount?: boolean; loginHint?: string }): void {
  const pending: PendingGoogleSignIn = { state: randomToken(16), returnTo: opts.returnTo, silent: !!opts.silent, createdAt: Date.now() }
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch {
    return
  }
  location.assign(
    googleAuthUrl({
      clientId: GOOGLE_CLIENT_ID,
      redirectUri: appRootUrl(),
      state: pending.state,
      loginHint: opts.chooseAccount ? undefined : opts.loginHint,
      prompt: opts.silent ? 'none' : opts.chooseAccount ? 'select_account' : undefined,
    }),
  )
}

export type GoogleCallback =
  | { kind: 'none' }
  | { kind: 'mismatch' }
  | { kind: 'token'; accessToken: string; expiresInMs: number; pending: PendingGoogleSignIn }
  | { kind: 'error'; error: string; pending: PendingGoogleSignIn }

/**
 * Is this page load Google's redirect for a sign-in started on this device? The app's own
 * hash routes (`#/progress`) never carry `state=`; a wrong state or an old attempt is refused.
 */
export function matchGoogleCallback(hash: string, pending: PendingGoogleSignIn | undefined, now: number): GoogleCallback {
  if (!hash.startsWith('#') || hash.startsWith('#/')) return { kind: 'none' }
  const params = new URLSearchParams(hash.slice(1))
  const state = params.get('state')
  const token = params.get('access_token')
  const error = params.get('error')
  if (!state || (!token && !error)) return { kind: 'none' }
  if (!pending || state !== pending.state || now - pending.createdAt > MAX_AGE_MS) return { kind: 'mismatch' }
  if (error) return { kind: 'error', error, pending }
  const seconds = Number(params.get('expires_in'))
  return { kind: 'token', accessToken: token!, expiresInMs: (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000, pending }
}

function readPending(): PendingGoogleSignIn | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as PendingGoogleSignIn | null
    return value && typeof value.state === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

export type GoogleCallbackResult =
  | { kind: 'token'; returnTo: string }
  | { kind: 'error'; returnTo: string; error: string; silent: boolean }
  | { kind: 'mismatch'; returnTo: string }

/** Call once at startup, before the router renders. Returns what happened and the route to show. */
export function handleGoogleCallback(now = Date.now()): GoogleCallbackResult | undefined {
  const match = matchGoogleCallback(location.hash, readPending(), now)
  if (match.kind === 'none') return undefined
  // The token must not stay in the address bar or history.
  history.replaceState(null, '', `${location.pathname}${location.search}`)
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // Storage blocked: the attempt expires on its own.
  }
  if (match.kind === 'mismatch') return { kind: 'mismatch', returnTo: '/settings' }
  const returnTo = match.pending.returnTo.startsWith('/') ? match.pending.returnTo : '/settings'
  if (match.kind === 'error') return { kind: 'error', returnTo, error: match.error, silent: match.pending.silent }
  saveGoogleToken(match.accessToken, now + match.expiresInMs)
  return { kind: 'token', returnTo }
}

function saveGoogleToken(accessToken: string, expiresAt: number): void {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, expiresAt }))
  } catch {
    // Without storage the token is lost on reload; sync asks to sign in again.
  }
}

/** The current access token, if it is still valid. */
export function getGoogleToken(now = Date.now()): string | undefined {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as { accessToken?: string; expiresAt?: number } | null
    return t?.accessToken && typeof t.expiresAt === 'number' && t.expiresAt - EXPIRY_MARGIN_MS > now ? t.accessToken : undefined
  } catch {
    return undefined
  }
}

export function clearGoogleToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing stored.
  }
}

/** The signed-in Google account's e-mail (scope `email`), for display and as login hint. */
export async function fetchGoogleEmail(accessToken: string, fetchImpl: FetchLike = (i, init) => fetch(i, init)): Promise<string | undefined> {
  try {
    const res = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${accessToken}` } })
    if (!res.ok) return undefined
    const body = (await res.json()) as { email?: unknown }
    return typeof body.email === 'string' ? body.email : undefined
  } catch {
    return undefined
  }
}
