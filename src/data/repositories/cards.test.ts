import { beforeEach, describe, expect, it } from 'vitest'
import { ALL_TABLES, db } from '../db'
import { createCard, createCards, deleteCard, deleteCardsByTag, getCard, loadDeck, removeTag, updateCard } from './cards'

const image = (text: string) => ({ blob: new Blob([text], { type: 'image/webp' }), mime: 'image/webp', width: 10, height: 10 })

beforeEach(async () => {
  await Promise.all(ALL_TABLES().map((t) => t.clear()))
})

describe('card repository', () => {
  it('creates normalised cards with a not-started review state', async () => {
    const card = await createCard({ hanzi: ' 老師 ', pinyin: 'lao3shi1', meaning: ' teacher ', notes: '  ' }, 1000)
    expect(card).toMatchObject({ hanzi: '老師', pinyin: 'lǎoshī', meaning: 'teacher', notes: undefined, source: { type: 'manual' } })
    const deck = await loadDeck()
    expect(deck).toHaveLength(1)
    expect(deck[0]!.state).toMatchObject({ box: 0, dueOn: null, cardId: card.id })
  })

  it('keeps batch order through createdAt', async () => {
    const cards = await createCards([{ hanzi: '一', pinyin: '' }, { hanzi: '二', pinyin: '' }, { hanzi: '三', pinyin: '' }], 5000)
    expect(cards.map((c) => c.createdAt)).toEqual([5000, 5001, 5002])
  })

  it('rejects a card without characters and writes nothing', async () => {
    await expect(createCards([{ hanzi: '好', pinyin: '' }, { hanzi: ' ', pinyin: 'x' }])).rejects.toThrow('required')
    expect(await db.cards.count()).toBe(0)
  })

  it('stores, replaces and removes images', async () => {
    const card = await createCard({ hanzi: '貓', pinyin: 'māo', image: image('a') })
    const firstImage = card.imageId!
    expect(await (await db.media.get(firstImage))!.blob.text()).toBe('a')

    const replaced = await updateCard(card.id, { hanzi: '貓', pinyin: 'māo' }, image('b'))
    expect(replaced.imageId).not.toBe(firstImage)
    expect(await db.media.get(firstImage)).toBeUndefined()

    const kept = await updateCard(card.id, { hanzi: '貓', pinyin: 'māo', meaning: 'cat' })
    expect(kept.imageId).toBe(replaced.imageId)

    const removed = await updateCard(card.id, { hanzi: '貓', pinyin: 'māo' }, null)
    expect(removed.imageId).toBeUndefined()
    expect(await db.media.count()).toBe(0)
  })

  it('soft-deletes', async () => {
    const card = await createCard({ hanzi: '狗', pinyin: 'gǒu' })
    await deleteCard(card.id, 9999)
    expect(await getCard(card.id)).toBeUndefined()
    expect(await loadDeck()).toHaveLength(0)
    expect((await db.cards.get(card.id))!.deletedAt).toBe(9999)
  })

  it('removes or keeps the cards with a tag', async () => {
    const [cat, dog] = await createCards([{ hanzi: '貓', pinyin: 'māo', tags: ['sample'] }, { hanzi: '狗', pinyin: 'gǒu', tags: ['sample', 'pets'] }], 1000)
    const mine = await createCard({ hanzi: '茶', pinyin: 'chá' }, 2000)
    expect(await removeTag('sample', 3000)).toBe(2)
    expect(await getCard(dog!.id)).toMatchObject({ tags: ['pets'], updatedAt: 3000 })
    expect(await getCard(cat!.id)).toMatchObject({ tags: [] })
    expect(await removeTag('sample', 4000)).toBe(0)

    await createCard({ hanzi: '水', pinyin: 'shuǐ', tags: ['sample'] }, 5000)
    expect(await deleteCardsByTag('sample', 6000)).toBe(1)
    expect((await loadDeck()).map((e) => e.card.id).sort()).toEqual([cat!.id, dog!.id, mine.id].sort())
  })
})
