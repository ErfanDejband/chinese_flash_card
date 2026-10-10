import { describe, expect, it } from 'vitest'
import { matchCallback, type PendingSignIn } from './openrouterSignIn'

const pending: PendingSignIn = { verifier: 'V', state: 'S', returnTo: '/import', createdAt: 1_000_000 }

describe('matchCallback', () => {
  it('accepts the redirect of a sign-in started on this device', () => {
    expect(matchCallback('?code=C&state=S', pending, 1_060_000)).toEqual({ kind: 'ok', code: 'C', pending })
  })

  it('ignores page loads that are not a sign-in', () => {
    expect(matchCallback('', pending, 1_060_000)).toEqual({ kind: 'none' })
    expect(matchCallback('?code=C&state=S', undefined, 1_060_000)).toEqual({ kind: 'none' })
  })

  it('refuses a wrong state or an old attempt', () => {
    expect(matchCallback('?code=C&state=other', pending, 1_060_000)).toEqual({ kind: 'mismatch' })
    expect(matchCallback('?code=C', pending, 1_060_000)).toEqual({ kind: 'mismatch' })
    expect(matchCallback('?code=C&state=S', pending, 1_000_000 + 16 * 60_000)).toEqual({ kind: 'mismatch' })
  })
})
