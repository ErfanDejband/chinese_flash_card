import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_LEITNER } from '@/domain/leitner/config'
import { ALL_TABLES, db } from '../db'
import { createCard, updateCard } from '../repositories/cards'
import { recordAnswer } from '../repositories/review'
import { BackupFormatError, exportBackup, restoreBackup } from './backup'

const wipe = () => Promise.all(ALL_TABLES().map((t) => t.clear()))
const image = { blob: new Blob(['png-bytes'], { type: 'image/png' }), mime: 'image/png', width: 4, height: 3 }

beforeEach(wipe)

describe('backup', () => {
  it('round-trips everything with replace', async () => {
    const card = await createCard({ hanzi: '老師', pinyin: 'lǎoshī', meaning: 'teacher', image })
    await recordAnswer(card.id, 'knew', DEFAULT_LEITNER)
    const zip = await exportBackup()

    await wipe()
    await createCard({ hanzi: '臨時', pinyin: 'línshí' }) // replaced away
    const result = await restoreBackup(zip, 'replace')

    expect(result).toEqual({ cards: 1, media: 1, reviews: 1 })
    const cards = await db.cards.toArray()
    expect(cards).toEqual([card])
    const media = await db.media.get(card.imageId!)
    expect(media).toMatchObject({ mime: 'image/png', width: 4, height: 3 })
    expect(await media!.blob.text()).toBe('png-bytes')
    expect((await db.reviewStates.toArray())[0]).toMatchObject({ cardId: card.id, box: 2 })
  })

  it('merge keeps the newer version of each row and unions logs', async () => {
    // Device A: two cards, one review.
    const a = await createCard({ hanzi: '一', pinyin: 'yī' }, 1000)
    const b = await createCard({ hanzi: '二', pinyin: 'èr' }, 1000)
    await recordAnswer(a.id, 'knew', DEFAULT_LEITNER, new Date(2000))
    const backupA = await exportBackup()

    // Device B (simulated by editing after the export): newer edit of `a`, older state of `b`.
    await updateCard(a.id, { hanzi: '一', pinyin: 'yī', meaning: 'one (edited later)' }, undefined, 5000)
    await db.cards.update(b.id, { meaning: 'stale', updatedAt: 500 })
    const c = await createCard({ hanzi: '三', pinyin: 'sān' }, 6000)
    await db.reviewLog.clear()

    await restoreBackup(backupA, 'merge')

    expect((await db.cards.get(a.id))!.meaning).toBe('one (edited later)') // local newer wins
    expect((await db.cards.get(b.id))!.meaning).toBeUndefined() // backup newer wins
    expect(await db.cards.get(c.id)).toBeDefined() // local-only row kept
    expect(await db.reviewLog.count()).toBe(1) // log restored from backup

    await restoreBackup(backupA, 'merge') // idempotent
    expect(await db.reviewLog.count()).toBe(1)
  })

  it('rejects files that are not backups', async () => {
    await expect(restoreBackup(new Uint8Array([1, 2, 3]), 'merge')).rejects.toBeInstanceOf(BackupFormatError)
  })
})
