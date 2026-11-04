import { createCards, listActiveCards } from '@/data/repositories/cards'
import { ZHUYIN_SYMBOLS, ZHUYIN_TAG } from '@/domain/zhuyinSymbols'

/** Add the symbol cards, in lesson order; symbols already in the deck are skipped. Returns how many. */
export async function addZhuyinDeck(): Promise<number> {
  const existing = new Set((await listActiveCards()).map((c) => c.hanzi))
  const symbols = ZHUYIN_SYMBOLS.filter((s) => !existing.has(s.symbol))
  await createCards(symbols.map(({ symbol, pinyin, hint, example }) => ({ hanzi: symbol, pinyin, meaning: hint, example, tags: [ZHUYIN_TAG] })))
  return symbols.length
}
