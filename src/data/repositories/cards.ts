import { joinDeck, type DeckEntry } from '@/domain/deck'
import { newId } from '@/domain/ids'
import { newReviewState } from '@/domain/leitner/scheduler'
import { normalizePinyin } from '@/domain/pinyin/tones'
import type { Card, CardSource, Id, ReviewMode } from '@/domain/types'
import { db } from '../db'
import { putMedia, type NewMedia } from './media'

export const DEFAULT_DECK_ID = 'default'
export const DEFAULT_MODE: ReviewMode = 'image_to_word'

/** Editable fields of a card. */
export interface CardDraft {
  hanzi: string
  pinyin: string
  meaning?: string
  notes?: string
  tags?: string[]
}

export interface NewCard extends CardDraft {
  image?: NewMedia
  source?: CardSource
}

const clean = (s: string | undefined) => {
  const t = s?.trim()
  return t ? t : undefined
}

function normalizeDraft(d: CardDraft) {
  return {
    hanzi: d.hanzi.trim(),
    pinyin: normalizePinyin(d.pinyin),
    meaning: clean(d.meaning),
    notes: clean(d.notes),
    tags: d.tags?.map((t) => t.trim()).filter(Boolean) ?? [],
  }
}

export function validateCardDraft(d: CardDraft): string[] {
  return d.hanzi.trim() ? [] : ['Chinese characters are required.']
}

/**
 * Create cards (and their new-card review state) in one transaction. Cards get increasing
 * `createdAt` values so the new-card pool introduces them in the given order.
 */
export async function createCards(inputs: NewCard[], now = Date.now()): Promise<Card[]> {
  for (const input of inputs) {
    const errors = validateCardDraft(input)
    if (errors.length) throw new Error(errors.join('\n'))
  }
  return db.transaction('rw', db.cards, db.reviewStates, db.media, async () => {
    const created: Card[] = []
    for (const [i, input] of inputs.entries()) {
      const at = now + i
      const card: Card = {
        id: newId(),
        ...normalizeDraft(input),
        imageId: input.image ? await putMedia(input.image, at) : undefined,
        deckId: DEFAULT_DECK_ID,
        source: input.source ?? { type: 'manual' },
        createdAt: at,
        updatedAt: at,
      }
      await db.cards.add(card)
      await db.reviewStates.add(newReviewState(card.id, DEFAULT_MODE, at))
      created.push(card)
    }
    return created
  })
}

export async function createCard(input: NewCard, now = Date.now()): Promise<Card> {
  const [card] = await createCards([input], now)
  return card!
}

/**
 * Update content fields. `image`: undefined keeps the current image, null removes it,
 * a value replaces it.
 */
export async function updateCard(id: Id, draft: CardDraft, image?: NewMedia | null, now = Date.now()): Promise<Card> {
  const errors = validateCardDraft(draft)
  if (errors.length) throw new Error(errors.join('\n'))
  return db.transaction('rw', db.cards, db.media, async () => {
    const existing = await db.cards.get(id)
    if (!existing || existing.deletedAt !== undefined) throw new Error('Card not found')
    let imageId = existing.imageId
    if (image !== undefined) {
      if (existing.imageId) await db.media.delete(existing.imageId)
      imageId = image ? await putMedia(image, now) : undefined
    }
    const card: Card = { ...existing, ...normalizeDraft(draft), imageId, updatedAt: now }
    await db.cards.put(card)
    return card
  })
}

/** Soft delete: the row stays (for a future sync) but disappears from the app. */
export async function deleteCard(id: Id, now = Date.now()): Promise<void> {
  await db.cards.update(id, { deletedAt: now, updatedAt: now })
}

export async function getCard(id: Id): Promise<Card | undefined> {
  const card = await db.cards.get(id)
  return card?.deletedAt === undefined ? card : undefined
}

export function listActiveCards(): Promise<Card[]> {
  return db.cards.filter((c) => c.deletedAt === undefined).toArray()
}

/** All active cards joined with their review state for `mode`. */
export async function loadDeck(mode: ReviewMode = DEFAULT_MODE, now = Date.now()): Promise<DeckEntry[]> {
  const [cards, states] = await Promise.all([listActiveCards(), db.reviewStates.toArray()])
  return joinDeck(cards, states, mode, now)
}
