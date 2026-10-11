import { beforeEach, describe, expect, it } from 'vitest'
import { ALL_TABLES, db } from '../db'
import { createCard, deleteCard, setCardImage } from './cards'
import {
  addPictureSheets,
  chooseOption,
  createPictureJob,
  discardPictureJob,
  getPictureJob,
  listPictureDrafts,
  markSheetError,
  savePlans,
  saveKeptPictures,
  saveSheetResult,
} from './pictures'

beforeEach(async () => {
  await Promise.all(ALL_TABLES().map((t) => t.clear()))
})

const pic = (label: string) => ({ blob: new Blob([label], { type: 'image/webp' }), mime: 'image/webp', width: 10, height: 10 })
const plan = (picturable: boolean) => ({ picturable, scene: 's', emoji: '🐶', searchQuery: 'q' })
const box = [0, 0, 500, 500] as [number, number, number, number]

async function setup() {
  const dog = await createCard({ hanzi: '小狗', pinyin: 'xiǎogǒu', meaning: 'puppy' }, 1000)
  const very = await createCard({ hanzi: '很', pinyin: 'hěn', meaning: 'very' }, 1001)
  const gone = await createCard({ hanzi: '舊', pinyin: 'jiù' }, 1002)
  await deleteCard(gone.id, 1003)
  const job = await createPictureJob([dog.id, very.id, gone.id], 'import', 2000)
  return { dog, very, job }
}

describe('picture jobs', () => {
  it('starts with the cards still in the deck, then takes the plans', async () => {
    const { dog, very, job } = await setup()
    expect(job.status).toBe('planning')
    expect((await listPictureDrafts(job.id)).map((d) => [d.hanzi, d.meaning, d.include, d.keep, d.status])).toEqual([
      ['小狗', 'puppy', true, true, 'waiting'],
      ['很', 'very', true, true, 'waiting'],
    ])
    await savePlans(job.id, [plan(true), plan(false)], false)
    expect((await getPictureJob(job.id))?.status).toBe('setup')
    expect((await listPictureDrafts(job.id)).map((d) => [d.cardId, d.include])).toEqual([
      [dog.id, true],
      [very.id, false],
    ])
  })

  it('gives cards the pictures cut from a sheet, or marks them failed', async () => {
    const { dog, very, job } = await setup()
    const [sheet] = await addPictureSheets(job.id, [{ cardIds: [dog.id, very.id], variants: false }])
    expect(sheet).toMatchObject({ order: 1, status: 'pending' })
    await saveSheetResult(sheet!.id, { image: new Blob(['sheet']), width: 1536, height: 1024, boxes: [box, box], pictures: [pic('dog'), null] })
    const [d, v] = await listPictureDrafts(job.id)
    expect(d).toMatchObject({ status: 'ready', sheetId: sheet!.id, cell: 0, box })
    expect(await d!.picture!.blob.text()).toBe('dog')
    expect(v).toMatchObject({ status: 'failed' })

    const [again] = await addPictureSheets(job.id, [{ cardIds: [dog.id, very.id], variants: false }])
    expect(again!.order).toBe(2)
    await markSheetError(again!.id, 'No credit')
    // The dog keeps its picture; the other card now says why it has none.
    expect((await listPictureDrafts(job.id)).map((x) => [x.status, x.error])).toEqual([
      ['ready', undefined],
      ['failed', 'No credit'],
    ])
  })

  it('offers four versions and uses the chosen one', async () => {
    const { dog, job } = await setup()
    const [variants] = await addPictureSheets(job.id, [{ cardIds: [dog.id], variants: true }])
    const boxes = [0, 1, 2, 3].map((i) => [i, i, 500, 500] as [number, number, number, number])
    await saveSheetResult(variants!.id, { image: new Blob(['v']), width: 1024, height: 1024, boxes, pictures: ['a', 'b', 'c', 'd'].map(pic) })
    expect((await listPictureDrafts(job.id))[0]!.options).toHaveLength(4)

    await chooseOption(`${job.id}:${dog.id}`, 2)
    const [d] = await listPictureDrafts(job.id)
    expect(d).toMatchObject({ status: 'ready', keep: true, cell: 2, box: boxes[2], sheetId: variants!.id, options: undefined })
    expect(await d!.picture!.blob.text()).toBe('c')
  })

  it('saves only kept, ready pictures to their cards and closes the job', async () => {
    const { dog, very, job } = await setup()
    const [sheet] = await addPictureSheets(job.id, [{ cardIds: [dog.id, very.id], variants: false }])
    await saveSheetResult(sheet!.id, { image: new Blob(['s']), width: 1, height: 1, boxes: [box, box], pictures: [pic('dog'), pic('very')] })
    await db.pictureDrafts.update(`${job.id}:${very.id}`, { keep: false })

    expect(await saveKeptPictures(job.id, 5000)).toBe(1)
    const savedDog = await db.cards.get(dog.id)
    expect(savedDog).toMatchObject({ updatedAt: 5000 })
    expect(await (await db.media.get(savedDog!.imageId!))!.blob.text()).toBe('dog')
    expect((await db.cards.get(very.id))!.imageId).toBeUndefined()
    expect(await getPictureJob(job.id)).toBeUndefined()
    expect(await db.pictureDrafts.count()).toBe(0)
    expect(await db.pictureSheets.count()).toBe(0)
  })

  it('discards a job without touching the cards', async () => {
    const { job } = await setup()
    await discardPictureJob(job.id)
    expect(await db.pictureJobs.count()).toBe(0)
    expect(await db.cards.filter((c) => c.imageId !== undefined).count()).toBe(0)
  })
})

describe('setCardImage', () => {
  it('replaces a card picture and removes the old one', async () => {
    const card = await createCard({ hanzi: '狗', pinyin: 'gǒu', image: pic('old') }, 1000)
    await setCardImage(card.id, pic('new'), 2000)
    const saved = (await db.cards.get(card.id))!
    expect(saved.imageId).not.toBe(card.imageId)
    expect(await db.media.get(card.imageId!)).toBeUndefined()
    expect(await (await db.media.get(saved.imageId!))!.blob.text()).toBe('new')
  })
})
