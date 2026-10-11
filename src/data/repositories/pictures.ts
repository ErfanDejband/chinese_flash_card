import { newId } from '@/domain/ids'
import type { Id } from '@/domain/types'
import type { NormBox } from '@/import/types'
import type { SheetSize } from '@/pictures/sheet'
import type { PictureStyleId } from '@/pictures/styles'
import type { PicturePlan, PictureService } from '@/pictures/types'
import { db, type PictureBlob, type PictureDraftRecord, type PictureJobRecord, type PictureSheetRecord } from '../db'
import { setCardImage } from './cards'

const draftId = (jobId: Id, cardId: Id) => `${jobId}:${cardId}`

/** Start a job for these cards (deleted cards are skipped), in the given order. */
export async function createPictureJob(cardIds: Id[], from: PictureJobRecord['from'], now = Date.now()): Promise<PictureJobRecord> {
  const job: PictureJobRecord = { id: newId(), from, status: 'planning', createdAt: now, updatedAt: now }
  await db.transaction('rw', db.cards, db.pictureJobs, db.pictureDrafts, async () => {
    const cards = (await db.cards.bulkGet([...new Set(cardIds)])).filter((c) => c && c.deletedAt === undefined)
    await db.pictureJobs.add(job)
    await db.pictureDrafts.bulkAdd(
      cards.map((c, order) => ({
        id: draftId(job.id, c!.id),
        jobId: job.id,
        cardId: c!.id,
        order,
        hanzi: c!.hanzi,
        pinyin: c!.pinyin,
        meaning: c!.meaning ?? '',
        include: true,
        status: 'waiting' as const,
        keep: true,
        updatedAt: now,
      })),
    )
  })
  return job
}

export function getPictureJob(id: Id): Promise<PictureJobRecord | undefined> {
  return db.pictureJobs.get(id)
}

export async function listOpenPictureJobs(): Promise<PictureJobRecord[]> {
  return (await db.pictureJobs.toArray()).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function listPictureDrafts(jobId: Id): Promise<PictureDraftRecord[]> {
  return (await db.pictureDrafts.where('jobId').equals(jobId).toArray()).sort((a, b) => a.order - b.order)
}

export async function listPictureSheets(jobId: Id): Promise<PictureSheetRecord[]> {
  return (await db.pictureSheets.where('jobId').equals(jobId).toArray()).sort((a, b) => a.order - b.order)
}

/** Plans in draft order; words that can't be pictured start excluded. */
export async function savePlans(jobId: Id, plans: PicturePlan[], planFailed: boolean, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.pictureJobs, db.pictureDrafts, async () => {
    const drafts = await listPictureDrafts(jobId)
    await db.pictureDrafts.bulkPut(drafts.map((d, i) => ({ ...d, plan: plans[i], include: plans[i]?.picturable ?? true, updatedAt: now })))
    await db.pictureJobs.update(jobId, { status: 'setup', planFailed, updatedAt: now })
  })
}

export async function updatePictureDraft(
  id: string,
  patch: Partial<Pick<PictureDraftRecord, 'include' | 'keep' | 'status' | 'picture' | 'sheetId' | 'cell' | 'box' | 'options' | 'optionsSheetId' | 'error'>>,
  now = Date.now(),
): Promise<void> {
  await db.pictureDrafts.update(id, { ...patch, updatedAt: now })
}

export interface RunChoice {
  method: 'paid' | 'emoji'
  style?: PictureStyleId
  perSheet?: SheetSize
  service?: PictureService
  model?: string
}

export async function setPictureJobStatus(jobId: Id, status: PictureJobRecord['status'], choice?: RunChoice, now = Date.now()): Promise<void> {
  await db.pictureJobs.update(jobId, { ...choice, status, updatedAt: now })
}

/** Queue sheets (cards in cell order) after the job's existing ones. */
export async function addPictureSheets(jobId: Id, sheets: { cardIds: Id[]; variants: boolean }[], now = Date.now()): Promise<PictureSheetRecord[]> {
  return db.transaction('rw', db.pictureSheets, async () => {
    const start = (await db.pictureSheets.where('jobId').equals(jobId).count()) + 1
    const records = sheets.map((s, i): PictureSheetRecord => ({ id: newId(), jobId, order: start + i, ...s, status: 'pending', updatedAt: now }))
    await db.pictureSheets.bulkAdd(records)
    return records
  })
}

export interface SavedSheet {
  image: Blob
  width: number
  height: number
  boxes: NormBox[]
  /** The crop of each cell (null where it was too small). */
  pictures: (PictureBlob | null)[]
}

/** Store a finished sheet and give its cards their pictures (or, for a variants sheet, the options). */
export async function saveSheetResult(sheetId: Id, result: SavedSheet, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.pictureSheets, db.pictureDrafts, async () => {
    const sheet = await db.pictureSheets.get(sheetId)
    if (!sheet) return
    const { pictures, ...stored } = result
    await db.pictureSheets.put({ ...sheet, ...stored, status: 'done', error: undefined, updatedAt: now })
    if (sheet.variants) {
      const options = pictures.filter((p): p is PictureBlob => p !== null)
      await db.pictureDrafts.update(draftId(sheet.jobId, sheet.cardIds[0]!), { options, optionsSheetId: sheet.id, updatedAt: now })
      return
    }
    for (const [cell, cardId] of sheet.cardIds.entries()) {
      const picture = pictures[cell]
      await db.pictureDrafts.update(
        draftId(sheet.jobId, cardId),
        picture
          ? { status: 'ready', picture, sheetId: sheet.id, cell, box: result.boxes[cell], error: undefined, updatedAt: now }
          : { status: 'failed', error: 'The picture was too small to cut out.', updatedAt: now },
      )
    }
  })
}

export async function markSheetError(sheetId: Id, error: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.pictureSheets, db.pictureDrafts, async () => {
    const sheet = await db.pictureSheets.get(sheetId)
    if (!sheet) return
    await db.pictureSheets.update(sheetId, { status: 'error', error, updatedAt: now })
    if (sheet.variants) return
    for (const cardId of sheet.cardIds) {
      const id = draftId(sheet.jobId, cardId)
      const d = await db.pictureDrafts.get(id)
      // A card that already has a picture keeps it.
      if (d && d.status !== 'ready') await db.pictureDrafts.update(id, { status: 'failed', error, updatedAt: now })
    }
  })
}

/** Use option `index` of a Regenerate: it becomes the card's picture. */
export async function chooseOption(id: string, index: number, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.pictureSheets, db.pictureDrafts, async () => {
    const d = await db.pictureDrafts.get(id)
    const picture = d?.options?.[index]
    if (!d || !picture) return
    const sheet = d.optionsSheetId ? await db.pictureSheets.get(d.optionsSheetId) : undefined
    await db.pictureDrafts.put({
      ...d,
      picture,
      sheetId: d.optionsSheetId,
      cell: index,
      box: sheet?.boxes?.[index],
      status: 'ready',
      keep: true,
      options: undefined,
      optionsSheetId: undefined,
      error: undefined,
      updatedAt: now,
    })
  })
}

async function deleteJobRows(jobId: Id) {
  await db.pictureSheets.where('jobId').equals(jobId).delete()
  await db.pictureDrafts.where('jobId').equals(jobId).delete()
  await db.pictureJobs.delete(jobId)
}

/** Save the kept pictures to their cards and close the job. Returns how many were saved. */
export async function saveKeptPictures(jobId: Id, now = Date.now()): Promise<number> {
  const drafts = await listPictureDrafts(jobId)
  const kept = drafts.filter((d) => d.keep && d.status === 'ready' && d.picture)
  for (const d of kept) await setCardImage(d.cardId, d.picture!, now)
  await db.transaction('rw', db.pictureJobs, db.pictureSheets, db.pictureDrafts, () => deleteJobRows(jobId))
  return kept.length
}

export async function discardPictureJob(jobId: Id): Promise<void> {
  await db.transaction('rw', db.pictureJobs, db.pictureSheets, db.pictureDrafts, () => deleteJobRows(jobId))
}
