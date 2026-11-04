import { beforeEach, describe, expect, it } from 'vitest'
import { listActiveCards, loadDeck, updateCard } from '@/data/repositories/cards'
import { db } from '@/data/db'
import { recordAnswer } from '@/data/repositories/review'
import { DEFAULT_LEITNER } from '@/domain/leitner/config'
import { outdatedSymbolCards, ZHUYIN_SYMBOLS, ZHUYIN_TAG } from '@/domain/zhuyinSymbols'
import { addZhuyinDeck, refreshZhuyinCards } from './zhuyinDeck'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

const card = async (hanzi: string) => (await listActiveCards()).find((c) => c.hanzi === hanzi)!

describe('addZhuyinDeck', () => {
  it('adds every symbol with its wording, and nothing to update', async () => {
    expect(await addZhuyinDeck()).toBe(37)
    expect(outdatedSymbolCards(await listActiveCards())).toEqual([])
  })

  it('skips symbols that are already there', async () => {
    await addZhuyinDeck()
    expect(await addZhuyinDeck()).toBe(0)
    expect((await listActiveCards()).length).toBe(ZHUYIN_SYMBOLS.length)
  })
})

describe('refreshZhuyinCards', () => {
  it('updates old wording, and leaves nothing outdated', async () => {
    await addZhuyinDeck()
    const old = await card('ㄕ')
    await updateCard(old.id, { hanzi: 'ㄕ', pinyin: 'sh', meaning: 'old hint', example: { hanzi: '山', pinyin: 'shān', meaning: 'mountain' }, tags: old.tags })
    expect(outdatedSymbolCards(await listActiveCards()).map((c) => c.hanzi)).toEqual(['ㄕ'])

    await refreshZhuyinCards(await listActiveCards())

    expect(outdatedSymbolCards(await listActiveCards())).toEqual([])
    expect((await card('ㄕ')).example?.hanzi).toBe('師')
  })

  it('keeps progress, notes and tags', async () => {
    await addZhuyinDeck()
    const old = await card('ㄕ')
    await updateCard(old.id, { hanzi: 'ㄕ', pinyin: 'sh', meaning: 'old hint', notes: 'my note', tags: [...old.tags, 'mine'] })
    await recordAnswer(old.id, 'knew', DEFAULT_LEITNER)
    const before = (await loadDeck('image_to_word')).find((e) => e.card.id === old.id)!.state

    await refreshZhuyinCards(await listActiveCards())

    const after = (await loadDeck('image_to_word')).find((e) => e.card.id === old.id)!
    expect(after.state).toEqual(before)
    expect(after.state.box).toBeGreaterThan(0)
    expect(after.card.notes).toBe('my note')
    expect(after.card.tags).toEqual([ZHUYIN_TAG, 'mine'])
  })
})
