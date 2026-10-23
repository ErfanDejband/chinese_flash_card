import { describe, expect, it } from 'vitest'
import { checkPinyin } from '@/domain/pinyin/suggest'
import { SAMPLE_WORDS } from '@/domain/sampleDeck'
import { loadSimplifiedDetector } from '@/import/extract/traditional'
import { CHECKLIST_WORD, TIP_WORD, TIPS } from './tips'

/** The words the app itself teaches must be right: Traditional characters and their dictionary reading. */
describe.each([
  ['sample deck', SAMPLE_WORDS],
  ['help words', [...Object.values(TIPS).map((t) => t.word), TIP_WORD, CHECKLIST_WORD]],
])('%s', (_, words) => {
  it.each(words.map((w) => [w.hanzi, w.pinyin]))('%s is read %s', (hanzi, pinyin) => {
    expect(checkPinyin(hanzi, pinyin)).toBe('match')
  })

  it('uses Traditional characters only', async () => {
    const isSimplified = await loadSimplifiedDetector()
    expect(words.filter((w) => isSimplified(w.hanzi)).map((w) => w.hanzi)).toEqual([])
  })

  it('has no word twice', () => {
    expect(new Set(words.map((w) => w.hanzi)).size).toBe(words.length)
  })
})
