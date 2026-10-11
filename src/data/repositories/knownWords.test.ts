import { beforeEach, describe, expect, it } from 'vitest'
import { ALL_TABLES, db } from '../db'
import { addKnownWords, knownHanziSet, listKnownWords, removeKnownWord } from './knownWords'

beforeEach(async () => {
  await Promise.all(ALL_TABLES().map((t) => t.clear()))
})

describe('known words', () => {
  it('adds words once, newest first, ignoring blanks', async () => {
    await addKnownWords(['我', ' 是 ', ''], 1000)
    await addKnownWords(['的', '我'], 2000)
    expect((await listKnownWords()).map((w) => [w.id, w.addedAt])).toEqual([
      ['的', 2000],
      ['我', 1000],
      ['是', 1000],
    ])
  })

  it('removes softly (for sync) and can add a word back', async () => {
    await addKnownWords(['我', '是'], 1000)
    await removeKnownWord('是', 2000)
    expect(await knownHanziSet()).toEqual(new Set(['我']))
    expect(await db.knownWords.get('是')).toMatchObject({ deletedAt: 2000, updatedAt: 2000 })

    await addKnownWords(['是'], 3000)
    const row = await db.knownWords.get('是')
    expect(row).toEqual({ id: '是', addedAt: 3000, updatedAt: 3000 })
  })
})
