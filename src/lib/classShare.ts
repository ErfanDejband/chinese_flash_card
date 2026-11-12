import { createClassDrive } from '@/classes/drive'
import { publishClass, stopSharing, type PublishOptions } from '@/classes/publish'
import { publishSource, saveShare } from '@/data/repositories/classStore'
import { deleteDeck, type RemoveCards } from '@/data/repositories/decks'
import { db } from '@/data/db'
import type { ClassLock, DeckShare, Id } from '@/domain/types'
import { CLASS_SCOPE, getGoogleToken, startGoogleSignIn } from './googleSignIn'
import { getDeviceSync } from './syncConfig'
import { requestSync } from './syncRunner'

/**
 * Sharing a deck as a class from the teacher's side. Needs a Google token with `drive.file`;
 * without one it hops to Google (asking only for that) and comes back to the deck page with
 * `?share=1` (or `?unshare=1`), which finishes what was asked. A new password's lock waits in
 * sessionStorage meanwhile.
 */
const PENDING_KEY = 'mandarin-leitner.class-share'

/** `remove`: after stopping, delete the deck too (keeping or deleting its cards). */
export type ShareAction = { deckId: Id; action: 'share' | 'unshare'; lock?: ClassLock | null; remove?: RemoveCards }

const classToken = () => getGoogleToken(Date.now(), CLASS_SCOPE)

function signIn(pending: ShareAction): 'signing-in' {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch {
    // Without storage the deck page asks again after the sign-in.
  }
  const sync = getDeviceSync()
  startGoogleSignIn({ returnTo: `/decks/${pending.deckId}?${pending.action}=1`, purpose: 'share', loginHint: sync.enabled ? sync.email : undefined })
  return 'signing-in'
}

/** What was asked before the hop to Google, for this deck (taken once). */
export function takePendingShare(deckId: Id): ShareAction | undefined {
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as ShareAction | null
    sessionStorage.removeItem(PENDING_KEY)
    return pending?.deckId === deckId ? pending : undefined
  } catch {
    return undefined
  }
}

/**
 * Publish the deck as a class, or publish its changes. `lock`: a new lock, `null` to remove the
 * password, undefined to keep the current one.
 */
export async function shareDeck(deckId: Id, opts: { lock?: ClassLock | null; onProgress?: PublishOptions['onProgress'] } = {}): Promise<DeckShare | 'signing-in'> {
  if (!classToken()) return signIn({ deckId, action: 'share', lock: opts.lock })
  const src = await publishSource(deckId)
  if (!src) throw new Error('This deck is gone.')
  const lock = opts.lock === undefined ? src.deck.share?.lock : (opts.lock ?? undefined)
  const share = await publishClass(
    createClassDrive(classToken),
    src,
    { lock, onProgress: opts.onProgress },
  )
  await saveShare(deckId, share)
  // The teacher's other devices learn where the class is (and can publish too).
  requestSync('review')
  return share
}

/**
 * Stop sharing: the class files leave the teacher's Drive. Students keep the cards they have and
 * see a note. With `remove`, the deck is deleted afterwards (only once the files are gone).
 */
export async function unshareDeck(deckId: Id, remove?: RemoveCards): Promise<'done' | 'signing-in'> {
  const deck = await db.decks.get(deckId)
  if (deck?.share) {
    if (!classToken()) return signIn({ deckId, action: 'unshare', remove })
    await stopSharing(createClassDrive(classToken), deck.share)
    await saveShare(deckId, undefined)
  }
  if (remove) await deleteDeck(deckId, remove)
  requestSync('review')
  return 'done'
}
