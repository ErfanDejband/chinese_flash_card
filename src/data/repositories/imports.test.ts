import { beforeEach, describe, expect, it } from 'vitest'
import type { PageDraft, PageResult } from '@/import/extract/runExtraction'
import { exportBackup } from '../backup/backup'
import { ALL_TABLES, db } from '../db'
import { loadDeck } from './cards'
import {
  commitImport,
  createImport,
  discardImport,
  listDrafts,
  listImportPages,
  listOpenImports,
  markPageRunning,
  queuePages,
  requeueInterrupted,
  savePageResult,
  updateDraft,
} from './imports'
import { unzipSync } from 'fflate'

beforeEach(async () => {
  await Promise.all(ALL_TABLES().map((t) => t.clear()))
})

const draft = (hanzi: string, overrides: Partial<PageDraft> = {}): PageDraft => ({
  kind: 'word',
  hanzi,
  pinyin: '',
  meaning: '',
  notes: '',
  imageBox: null,
  hanziSource: 'printed',
  pinyinSource: 'printed',
  meaningSource: 'printed',
  confidence: 0.9,
  flags: [],
  selected: true,
  ...overrides,
})

const result = (page: number, drafts: PageDraft[]): PageResult => ({
  rendered: {
    page,
    image: new Blob(['page']),
    width: 1920,
    height: 1080,
    pointWidth: 960,
    pointHeight: 540,
    aiImage: new Blob(['ai']),
    textHint: '',
  },
  model: 'm',
  raw: '{}',
  drafts,
})

async function setupImport() {
  return createImport({ fileName: 'book3.pdf', fileHash: 'abc', pageCount: 47, pages: [20, 13], provider: 'gemini', model: 'm' }, 1000)
}

describe('imports repository', () => {
  it('creates an import with pending pages', async () => {
    const record = await setupImport()
    expect(await listOpenImports()).toEqual([record])
    expect((await listImportPages(record.id)).map((p) => [p.page, p.status])).toEqual([
      [13, 'pending'],
      [20, 'pending'],
    ])
  })

  it('stores page results, replacing earlier drafts of that page', async () => {
    const { id } = await setupImport()
    await savePageResult(id, result(20, [draft('舊')]))
    await savePageResult(id, result(20, [draft('老師'), draft('學生')]))
    expect((await listDrafts(id)).map((d) => [d.hanzi, d.order])).toEqual([
      ['老師', 0],
      ['學生', 1],
    ])
    const page = (await listImportPages(id)).find((p) => p.page === 20)!
    expect(page).toMatchObject({ status: 'done', model: 'm', promptVersion: 1, pointWidth: 960 })
  })

  it('re-queues interrupted and failed pages but not finished ones', async () => {
    const { id } = await setupImport()
    await markPageRunning(id, 13)
    await savePageResult(id, result(20, []))
    await requeueInterrupted(id)
    await queuePages(id, [13, 20])
    expect((await listImportPages(id)).map((p) => [p.page, p.status])).toEqual([
      [13, 'pending'],
      [20, 'done'],
    ])
  })

  it('commits selected drafts as cards in page and reading order', async () => {
    const { id } = await setupImport()
    const crop = { blob: new Blob(['img']), mime: 'image/webp', width: 10, height: 10 }
    await savePageResult(id, result(20, [draft('老師', { crop, sourceBox: { x: 1, y: 2, width: 3, height: 4 } }), draft('我是老師。', { kind: 'sentence' })]))
    await savePageResult(id, result(13, [draft('今天'), draft('重複', { selected: false })]))
    const drafts = await listDrafts(id)
    await updateDraft(drafts.find((d) => d.hanzi === '今天')!.id, { meaning: 'today' })

    expect(await commitImport(id, 5000)).toEqual({ created: 3 })

    const deck = (await loadDeck()).sort((a, b) => a.card.createdAt - b.card.createdAt)
    expect(deck.map((e) => [e.card.hanzi, e.card.tags, e.state.box])).toEqual([
      ['今天', [], 0],
      ['老師', [], 0],
      ['我是老師。', ['sentence'], 0],
    ])
    const teacher = deck[1]!.card
    expect(teacher.imageId).toBeDefined()
    expect(teacher.source).toEqual({ type: 'pdf', importId: id, fileName: 'book3.pdf', page: 20, bbox: { x: 1, y: 2, width: 3, height: 4 } })
    expect(deck[0]!.card.meaning).toBe('today')

    expect(await db.imports.get(id)).toMatchObject({ status: 'committed', acceptedCount: 3, rejectedCount: 1 })
    expect(await db.importDrafts.count()).toBe(0)
    expect(await db.importPages.count()).toBe(0)
    await expect(commitImport(id)).rejects.toThrow('no longer open')
  })

  it('discards an import and its work tables', async () => {
    const { id } = await setupImport()
    await savePageResult(id, result(20, [draft('老師')]))
    await discardImport(id)
    expect(await listOpenImports()).toEqual([])
    expect(await db.importDrafts.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
  })

  it('keeps work tables out of backups', async () => {
    const { id } = await setupImport()
    await savePageResult(id, result(20, [draft('老師')]))
    const files = Object.keys(unzipSync(await exportBackup()))
    expect(files.some((f) => /importPages|importDrafts/.test(f))).toBe(false)
    expect(files).toContain('imports.json')
  })
})
