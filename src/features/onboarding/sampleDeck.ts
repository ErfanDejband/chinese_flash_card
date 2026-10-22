import { createCards, listActiveCards } from '@/data/repositories/cards'
import { SAMPLE_TAG, SAMPLE_WORDS } from '@/domain/sampleDeck'
import { renderEmoji } from '@/pictures/emoji'

/** Add the sample words, each with its emoji as the picture; words already in the deck are skipped. Returns how many. */
export async function addSampleDeck(): Promise<number> {
  const existing = new Set((await listActiveCards()).map((c) => c.hanzi))
  const words = SAMPLE_WORDS.filter((w) => !existing.has(w.hanzi))
  const cards = await Promise.all(
    words.map(async ({ hanzi, pinyin, meaning, emoji }) => ({ hanzi, pinyin, meaning, tags: [SAMPLE_TAG], image: await renderEmoji(emoji) })),
  )
  await createCards(cards)
  return cards.length
}
