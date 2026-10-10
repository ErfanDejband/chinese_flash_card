import { describe, expect, it } from 'vitest'
import { googleAuthUrl, matchGoogleCallback, type PendingGoogleSignIn } from './googleSignIn'

const pending: PendingGoogleSignIn = { state: 'S', returnTo: '/progress', silent: true, createdAt: 1_000_000 }

describe('googleAuthUrl', () => {
  it('asks for an access token for the app folder only', () => {
    const url = new URL(googleAuthUrl({ clientId: 'CID', redirectUri: 'https://example.github.io/app/', state: 'S', loginHint: 'me@gmail.com', prompt: 'none' }))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'CID',
      redirect_uri: 'https://example.github.io/app/',
      response_type: 'token',
      scope: 'https://www.googleapis.com/auth/drive.appdata email',
      include_granted_scopes: 'true',
      state: 'S',
      login_hint: 'me@gmail.com',
      prompt: 'none',
    })
  })
})

describe('matchGoogleCallback', () => {
  const now = 1_060_000

  it('accepts the token of a sign-in started here', () => {
    const r = matchGoogleCallback('#state=S&access_token=ya29.x&token_type=Bearer&expires_in=3599&scope=email', pending, now)
    expect(r).toEqual({ kind: 'token', accessToken: 'ya29.x', expiresInMs: 3_599_000, pending })
  })

  it('reports errors, e.g. a silent renewal that needs the user', () => {
    expect(matchGoogleCallback('#error=interaction_required&state=S', pending, now)).toEqual({ kind: 'error', error: 'interaction_required', pending })
  })

  it('ignores the app’s own routes and unrelated fragments', () => {
    expect(matchGoogleCallback('#/progress', pending, now)).toEqual({ kind: 'none' })
    expect(matchGoogleCallback('', pending, now)).toEqual({ kind: 'none' })
    expect(matchGoogleCallback('#section', pending, now)).toEqual({ kind: 'none' })
  })

  it('refuses a wrong state, a missing attempt or an old one', () => {
    expect(matchGoogleCallback('#state=X&access_token=t', pending, now)).toEqual({ kind: 'mismatch' })
    expect(matchGoogleCallback('#state=S&access_token=t', undefined, now)).toEqual({ kind: 'mismatch' })
    expect(matchGoogleCallback('#state=S&access_token=t', pending, pending.createdAt + 11 * 60_000)).toEqual({ kind: 'mismatch' })
  })
})
