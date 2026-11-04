import { createCards, listActiveCards, updateCard } from '@/data/repositories/cards'
import type { Card } from '@/domain/types'
import { outdatedSymbolCards, symbolInfo, ZHUYIN_SYMBOLS, ZHUYIN_TAG } from '@/domain/zhuyinSymbols'

/** Add the symbol cards, in teaching order; symbols already in the deck are skipped. Returns how many. */
export async function addZhuyinDeck(): Promise<number> {
  const existing = new Set((await listActiveCards()).map((c) => c.hanzi))
  const symbols = ZHUYIN_SYMBOLS.filter((s) => !existing.has(s.symbol))
  await createCards(symbols.map(({ symbol, pinyin, hint, example }) => ({ hanzi: symbol, pinyin, meaning: hint, example, tags: [ZHUYIN_TAG] })))
  return symbols.length
}

/** Give saved symbol cards the table's wording. Progress is kept apart from the card, so it stays, and so do notes. */
export async function refreshZhuyinCards(cards: readonly Card[]): Promise<void> {
  for (const card of outdatedSymbolCards(cards)) {
    const { pinyin, hint, example } = symbolInfo(card.hanzi)!
    await updateCard(card.id, { hanzi: card.hanzi, pinyin, meaning: hint, notes: card.notes, example, tags: card.tags })
  }
}
