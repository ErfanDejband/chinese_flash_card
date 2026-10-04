import { newId } from '@/domain/ids'
import type { Id } from '@/domain/types'
import { PROMPT_VERSION } from '@/import/ai/prompt'
import type { Rotation } from '@/import/render'
import type { PageResult } from '@/import/extract/runExtraction'
import { db, type ImportDraftRecord, type ImportPageRecord, type ImportRecord } from '../db'
import { createCards, type NewCard } from './cards'

const pageId = (importId: Id, page: number) => `${importId}:${page}`

export interface NewImportPage {
  page: number
  label: string
  sourceFile?: string
  rotation: Rotation
}

export interface NewImport {
  fileName: string
  fileHash: string
  sourceKind: 'pdf' | 'images'
  pageCount: number
  pages: NewImportPage[]
  provider: string
  model: string
}

/** Create an import with its selected pages queued as pending. */
export async function createImport(input: NewImport, now = Date.now()): Promise<ImportRecord> {
  const record: ImportRecord = {
    id: newId(),
    fileName: input.fileName,
    fileHash: input.fileHash,
    sourceKind: input.sourceKind,
    pageCount: input.pageCount,
    status: 'draft',
    acceptedCount: 0,
    rejectedCount: 0,
    provider: input.provider,
    model: input.model,
    createdAt: now,
    updatedAt: now,
  }
  await db.transaction('rw', db.imports, db.importPages, async () => {
    await db.imports.add(record)
    await db.importPages.bulkAdd(
      input.pages.map((p) => ({
        id: pageId(record.id, p.page),
        importId: record.id,
        page: p.page,
        label: p.label,
        sourceFile: p.sourceFile,
        rotation: p.rotation,
        status: 'pending' as const,
        updatedAt: now,
      })),
    )
  })
  return record
}

/** Queue more pages (e.g. retry failed ones); pages already done are left alone. */
export async function queuePages(importId: Id, pages: number[], now = Date.now()): Promise<void> {
  await db.transaction('rw', db.importPages, async () => {
    for (const page of pages) {
      const existing = await db.importPages.get(pageId(importId, page))
      if (existing?.status === 'done') continue
      await db.importPages.put({ ...existing, id: pageId(importId, page), importId, page, status: 'pending', error: undefined, updatedAt: now })
    }
  })
}

export function getImport(id: Id): Promise<ImportRecord | undefined> {
  return db.imports.get(id)
}

export async function listOpenImports(): Promise<ImportRecord[]> {
  const drafts = await db.imports.filter((i) => i.status === 'draft').toArray()
  return drafts.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Earlier imports of the same file (by content hash). */
export async function findImportsByHash(fileHash: string): Promise<ImportRecord[]> {
  if (!fileHash) return []
  return db.imports.where('fileHash').equals(fileHash).toArray()
}

export async function listImportPages(importId: Id): Promise<ImportPageRecord[]> {
  const pages = await db.importPages.where('importId').equals(importId).toArray()
  return pages.sort((a, b) => a.page - b.page)
}

export function getImportPage(importId: Id, page: number): Promise<ImportPageRecord | undefined> {
  return db.importPages.get(pageId(importId, page))
}

export async function listDrafts(importId: Id): Promise<ImportDraftRecord[]> {
  const drafts = await db.importDrafts.where('importId').equals(importId).toArray()
  return drafts.sort((a, b) => a.page - b.page || a.order - b.order)
}

/** Pages left 'running' by an interrupted session go back to the queue. */
export async function requeueInterrupted(importId: Id, now = Date.now()): Promise<void> {
  const pages = await db.importPages.where('importId').equals(importId).filter((p) => p.status === 'running').toArray()
  await db.importPages.bulkPut(pages.map((p) => ({ ...p, status: 'pending', updatedAt: now })))
}

export async function markPageRunning(importId: Id, page: number, now = Date.now()): Promise<void> {
  await db.importPages.update(pageId(importId, page), { status: 'running', error: undefined, updatedAt: now })
}

export async function markPageError(importId: Id, page: number, error: string, now = Date.now()): Promise<void> {
  await db.importPages.update(pageId(importId, page), { status: 'error', error, updatedAt: now })
}

/** Store a processed page and replace its drafts. */
export async function savePageResult(importId: Id, result: PageResult, now = Date.now()): Promise<void> {
  const { rendered } = result
  await db.transaction('rw', db.imports, db.importPages, db.importDrafts, async () => {
    // Keep what was set when the page was queued (label, file, rotation).
    const queued = await db.importPages.get(pageId(importId, rendered.page))
    await db.importPages.put({
      ...queued,
      id: pageId(importId, rendered.page),
      importId,
      page: rendered.page,
      status: 'done',
      image: rendered.image,
      width: rendered.width,
      height: rendered.height,
      pointWidth: rendered.pointWidth,
      pointHeight: rendered.pointHeight,
      textHint: rendered.textHint,
      model: result.model,
      promptVersion: PROMPT_VERSION,
      raw: result.raw,
      updatedAt: now,
    })
    await db.importDrafts.where('[importId+page]').equals([importId, rendered.page]).delete()
    await db.importDrafts.bulkAdd(
      result.drafts.map((d, order) => ({ ...d, id: newId(), importId, page: rendered.page, order, updatedAt: now })),
    )
    await db.imports.update(importId, { updatedAt: now })
  })
}

export type DraftPatch = Partial<
  Pick<ImportDraftRecord, 'kind' | 'hanzi' | 'pinyin' | 'meaning' | 'notes' | 'selected' | 'imageBox' | 'crop' | 'sourceBox' | 'flags'>
>

export async function updateDraft(id: Id, patch: DraftPatch, now = Date.now()): Promise<void> {
  await db.importDrafts.update(id, { ...patch, updatedAt: now })
}

export async function setDraftsSelected(ids: Id[], selected: boolean, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.importDrafts, async () => {
    for (const id of ids) await db.importDrafts.update(id, { selected, updatedAt: now })
  })
}

/** A draft can become a card once it has characters. */
export const isImportable = (d: ImportDraftRecord) => d.selected && d.hanzi.trim().length > 0

async function deleteWorkTables(importId: Id) {
  await db.importPages.where('importId').equals(importId).delete()
  await db.importDrafts.where('importId').equals(importId).delete()
}

/**
 * Turn the selected drafts into cards (in page and reading order, so they enter the new-card pool
 * in document order) and remove the import's work tables.
 */
export async function commitImport(importId: Id, now = Date.now()): Promise<{ created: number }> {
  return db.transaction('rw', [db.cards, db.reviewStates, db.media, db.imports, db.importPages, db.importDrafts], async () => {
    const record = await db.imports.get(importId)
    if (!record || record.status !== 'draft') throw new Error('This import is no longer open.')
    const drafts = await listDrafts(importId)
    const chosen = drafts.filter(isImportable)
    const pages = new Map((await listImportPages(importId)).map((p) => [p.page, p]))
    const inputs: NewCard[] = chosen.map((d) => ({
      hanzi: d.hanzi,
      pinyin: d.pinyin,
      meaning: d.meaning,
      notes: d.notes,
      tags: d.kind === 'sentence' ? ['sentence'] : [],
      image: d.crop,
      source:
        record.sourceKind === 'images'
          ? { type: 'image', importId, fileName: pages.get(d.page)?.sourceFile ?? record.fileName, bbox: d.sourceBox }
          : { type: 'pdf', importId, fileName: record.fileName, page: d.page, bbox: d.sourceBox },
    }))
    const cards = await createCards(inputs, now)
    await db.imports.update(importId, {
      status: 'committed',
      acceptedCount: cards.length,
      rejectedCount: drafts.length - cards.length,
      updatedAt: now,
    })
    await deleteWorkTables(importId)
    return { created: cards.length }
  })
}

export async function discardImport(importId: Id, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.imports, db.importPages, db.importDrafts, async () => {
    await db.imports.update(importId, { status: 'discarded', updatedAt: now })
    await deleteWorkTables(importId)
  })
}
