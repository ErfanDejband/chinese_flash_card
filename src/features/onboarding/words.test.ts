import { describe, expect, it } from 'vitest'
import { checkPinyin } from '@/domain/pinyin/suggest'
import { toZhuyin } from '@/domain/pinyin/zhuyin'
import { SAMPLE_WORDS } from '@/domain/sampleDeck'
import { ZHUYIN_SYMBOLS } from '@/domain/zhuyinSymbols'
import { loadSimplifiedDetector } from '@/import/extract/traditional'
import { CHECKLIST_WORD, TIP_WORD, TIPS } from './tips'

/** The words the app itself teaches must be right: Traditional characters and their dictionary reading. */
describe.each([
  ['sample deck', SAMPLE_WORDS],
  ['help words', [...Object.values(TIPS).map((t) => t.word), TIP_WORD, CHECKLIST_WORD]],
  ['zhuyin example words', ZHUYIN_SYMBOLS.map((s) => s.example)],
])('%s', (_, words) => {
  it.each(words.map((w) => [w.hanzi, w.pinyin]))('%s is read %s', (hanzi, pinyin) => {
    expect(checkPinyin(hanzi, pinyin)).toBe('match')
  })

  it.each(words.map((w) => [w.hanzi, w.pinyin]))('%s has a zhuyin reading for %s', (hanzi, pinyin) => {
    expect(toZhuyin(pinyin, hanzi)).not.toBeNull()
  })

  it('uses Traditional characters only', async () => {
    const isSimplified = await loadSimplifiedDetector()
    expect(words.filter((w) => isSimplified(w.hanzi)).map((w) => w.hanzi)).toEqual([])
  })

  it('has no word twice', () => {
    expect(new Set(words.map((w) => w.hanzi)).size).toBe(words.length)
  })
})
