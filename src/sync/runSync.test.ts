import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ALL_TABLES, AppDB, db as deviceA } from '@/data/db'
import { createCard, createCards, deleteCard, updateCard } from '@/data/repositories/cards'
import { recordAnswer, undoAnswer } from '@/data/repositories/review'
import { createSyncStore } from '@/data/repositories/syncStore'
import { DEFAULT_LEITNER, defaultSettings } from '@/domain/leitner/config'
import { inspectRemote, replaceLocalFromRemote, replaceRemoteFromLocal, runSync, type SyncProgress } from './runSync'
import { encodeJson, MANIFEST_FILE } from './snapshot'
import type { DriveLike, SyncFiles } from './types'

/** In-memory Drive app folder; versions bump on every write, like Drive's. */
function fakeDrive() {
  const files = new Map<string, { name: string; version: number; data: Uint8Array }>()
  const calls = { download: 0, create: 0, update: 0 }
  let seq = 0
  const drive: DriveLike = {
    list: async () => [...files].map(([id, f]) => ({ id, name: f.name, version: String(f.version) })),
    download: async (id) => {
      calls.download++
      return files.get(id)!.data
    },
    create: async (name, data) => {
      calls.create++
      const id = `file-${++seq}`
      files.set(id, { name, version: 1, data })
      return { id, name, version: '1' }
    },
    update: async (id, data) => {
      calls.update++
      const f = files.get(id)!
      f.version++
      f.data = data
      return { id, name: f.name, version: String(f.version) }
    },
    remove: async (id) => {
      files.delete(id)
    },
  }
  return { drive, files, calls }
}

const deviceB = new AppDB('device-b')
const tablesOf = (d: AppDB) => [
  d.cards,
  d.reviewStates,
  d.reviewLog,
  d.media,
  d.imports,
  d.settings,
  d.importPages,
  d.importDrafts,
  d.syncTombstones,
  d.knownWords,
]

beforeEach(async () => {
  await Promise.all([...ALL_TABLES(), ...tablesOf(deviceB)].map((t) => t.clear()))
})
afterAll(() => deviceB.close())

const storeA = createSyncStore(deviceA)
const storeB = createSyncStore(deviceB)
const day = (d: number, h = 10) => new Date(2026, 9, d, h, 0)

/** Each device remembers what it last saw of the Drive files. */
function devices() {
  const remote = fakeDrive()
  let filesA: SyncFiles = {}
  let filesB: SyncFiles = {}
  return {
    remote,
    syncA: async () => ((filesA = (await runSync(remote.drive, storeA, filesA)).files), filesA),
    syncB: async () => ((filesB = (await runSync(remote.drive, storeB, filesB)).files), filesB),
    outcomeA: () => runSync(remote.drive, storeA, filesA),
  }
}

describe('runSync between two devices', () => {
  it('brings cards, progress and history from A to B', async () => {
    const d = devices()
    const card = await createCard({ hanzi: '學生', pinyin: 'xuéshēng', meaning: 'student' }, day(1).getTime())
    await recordAnswer(card.id, 'knew', DEFAULT_LEITNER, day(2))
    await d.syncA()
    expect([...d.remote.files.values()].map((f) => f.name).sort()).toEqual(
      ['cards.json.gz', 'log-2026-10.json.gz', 'manifest.json.gz', 'states.json.gz'],
    )

    await d.syncB()
    expect((await deviceB.cards.get(card.id))?.hanzi).toBe('學生')
    expect(await deviceB.reviewLog.count()).toBe(1)
    expect((await deviceB.reviewStates.toArray())[0]).toMatchObject({ cardId: card.id, box: 2 })
  })

  it('skips files unchanged on both sides', async () => {
    const d = devices()
    await createCard({ hanzi: '老師', pinyin: 'lǎoshī' })
    await d.syncA()
    const again = await d.outcomeA()
    expect(again).toMatchObject({ downloaded: 0, uploaded: 0, localChanges: 0 })
  })

  it('keeps the newest edit when both devices changed a card', async () => {
    const d = devices()
    const card = await createCard({ hanzi: '朋友', pinyin: 'péngyou', meaning: 'friend' }, day(1).getTime())
    await d.syncA()
    await d.syncB()
    await updateCard(card.id, { hanzi: '朋友', pinyin: 'péngyou', meaning: 'friend (A)' }, undefined, day(3).getTime())
    const onB = (await deviceB.cards.get(card.id))!
    await deviceB.cards.put({ ...onB, meaning: 'friend (B, later)', updatedAt: day(4).getTime() })

    await d.syncA()
    await d.syncB()
    await d.syncA()
    expect((await deviceA.cards.get(card.id))?.meaning).toBe('friend (B, later)')
    expect((await deviceB.cards.get(card.id))?.meaning).toBe('friend (B, later)')
  })

  it('an undo on A removes the synced answer on B', async () => {
    const d = devices()
    const card = await createCard({ hanzi: '謝謝', pinyin: 'xièxie' }, day(1).getTime())
    const token = await recordAnswer(card.id, 'forgot', DEFAULT_LEITNER, day(2))
    await d.syncA()
    await d.syncB()
    expect(await deviceB.reviewLog.count()).toBe(1)

    await undoAnswer(token, day(2, 11).getTime())
    await d.syncA()
    await d.syncB()
    expect(await deviceB.reviewLog.count()).toBe(0)
    expect((await deviceB.reviewStates.toArray())[0]?.box).toBe(0)
  })

  it('syncs settings but keeps each device’s speech voice', async () => {
    const d = devices()
    await deviceA.settings.put({ ...defaultSettings(day(1).getTime()), newPerDay: 20, ttsVoiceURI: 'android-voice', id: 'app' })
    await deviceB.settings.put({ ...defaultSettings(day(2).getTime()), newPerDay: 15, ttsVoiceURI: 'windows-voice', id: 'app' })
    await d.syncB()
    await deviceA.settings.update('app', { newPerDay: 25, updatedAt: day(3).getTime() })
    await d.syncA()
    await d.syncB()
    expect(await deviceA.settings.get('app')).toMatchObject({ newPerDay: 25, ttsVoiceURI: 'android-voice' })
    expect(await deviceB.settings.get('app')).toMatchObject({ newPerDay: 25, ttsVoiceURI: 'windows-voice' })
  })

  it('syncs known words, including removals and adding one back', async () => {
    const d = devices()
    await deviceA.knownWords.bulkPut([
      { id: '我', addedAt: 1, updatedAt: 1 },
      { id: '是', addedAt: 1, updatedAt: 1 },
    ])
    await d.syncA()
    expect(d.remote.files.size).toBe(2) // known.json.gz + manifest
    await d.syncB()
    expect((await deviceB.knownWords.toArray()).map((w) => w.id)).toEqual(['我', '是'])

    await deviceB.knownWords.update('是', { deletedAt: 5, updatedAt: 5 })
    await deviceA.knownWords.put({ id: '的', addedAt: 6, updatedAt: 6 })
    await d.syncB()
    await d.syncA()
    await d.syncB()
    for (const device of [deviceA, deviceB]) {
      expect((await device.knownWords.filter((w) => w.deletedAt === undefined).toArray()).map((w) => w.id)).toEqual(['我', '的'])
    }

    await deviceA.knownWords.put({ id: '是', addedAt: 9, updatedAt: 9 })
    await d.syncA()
    await d.syncB()
    expect((await deviceB.knownWords.get('是'))?.deletedAt).toBeUndefined()
  })

  it('does not sync imports that are still drafts', async () => {
    const d = devices()
    const base = { fileName: 'book.pdf', fileHash: '', pageCount: 3, acceptedCount: 0, rejectedCount: 0, createdAt: 1, updatedAt: 1 }
    await deviceA.imports.bulkPut([
      { ...base, id: 'draft', status: 'draft' },
      { ...base, id: 'done', status: 'committed' },
    ])
    await d.syncA()
    await d.syncB()
    expect((await deviceB.imports.toArray()).map((i) => i.id)).toEqual(['done'])
  })
})

describe('first sync on a device', () => {
  it('reports what Drive holds', async () => {
    const d = devices()
    expect(await inspectRemote(d.remote.drive)).toEqual({ hasData: false, cards: 0 })
    await createCard({ hanzi: '再見', pinyin: 'zàijiàn' })
    await d.syncA()
    expect(await inspectRemote(d.remote.drive)).toEqual({ hasData: true, cards: 1 })
  })

  it('"use the Drive copy" replaces this device’s cards, keeping its voice', async () => {
    const d = devices()
    const fromA = await createCard({ hanzi: '你好', pinyin: 'nǐ hǎo' })
    await d.syncA()
    await deviceB.cards.put({ ...fromA, id: 'only-on-b', hanzi: '中文' })
    await deviceB.settings.put({ ...defaultSettings(1), ttsVoiceURI: 'windows-voice', id: 'app' })

    const outcome = await replaceLocalFromRemote(d.remote.drive, storeB)
    expect((await deviceB.cards.toArray()).map((c) => c.id)).toEqual([fromA.id])
    // Nothing left to upload afterwards.
    expect(await runSync(d.remote.drive, storeB, outcome.files)).toMatchObject({ uploaded: 0, downloaded: 0 })
  })

  it('"use this device" makes Drive and the other devices match this one', async () => {
    const d = devices()
    // A and B start in step with one shared card…
    const shared = await createCard({ hanzi: '學校', pinyin: 'xuéxiào', meaning: 'school' }, day(1).getTime())
    await d.syncA()
    await d.syncB()
    // …then B adds a card, edits the shared one, answers, and adds a known word; A adds its own card.
    const onlyB = { ...shared, id: 'only-on-b', hanzi: '電腦', updatedAt: day(2).getTime() }
    await deviceB.cards.bulkPut([onlyB, { ...(await deviceB.cards.get(shared.id))!, meaning: 'school (B)', updatedAt: day(3).getTime() }])
    await deviceB.reviewLog.put({ id: 'answer-b', cardId: shared.id, mode: 'image_to_word', at: day(3).getTime(), result: 'knew', fromBox: 0, toBox: 2 })
    await deviceB.knownWords.put({ id: '我', addedAt: 1, updatedAt: 1 })
    const listening = { id: `${shared.id}:listening`, cardId: shared.id, mode: 'listening' as const, box: 3, dueOn: '2026-10-07', introducedOn: '2026-10-03', lastReviewedAt: day(3).getTime(), reviewCount: 2, lapseCount: 0, updatedAt: day(3).getTime() }
    await deviceB.reviewStates.put(listening)
    await d.syncB()
    const onlyA = await createCard({ hanzi: '筆', pinyin: 'bǐ' }, day(4).getTime())

    // A starts over with "use this device".
    const outcome = await replaceRemoteFromLocal(d.remote.drive, storeA, { now: day(5).getTime() })
    const active = async (device: AppDB) => (await device.cards.filter((c) => c.deletedAt === undefined).toArray()).map((c) => c.id).sort()
    expect(await active(deviceA)).toEqual([shared.id, onlyA.id].sort())
    expect(await runSync(d.remote.drive, storeA, outcome.files)).toMatchObject({ uploaded: 0, downloaded: 0, localChanges: 0 })

    // B follows on its next sync.
    await d.syncB()
    expect(await active(deviceB)).toEqual([shared.id, onlyA.id].sort())
    expect((await deviceB.cards.get(shared.id))?.meaning).toBe('school')
    expect(await deviceB.reviewLog.count()).toBe(0)
    expect((await deviceB.knownWords.get('我'))?.deletedAt).toBeDefined()
    expect(await deviceB.reviewStates.get(listening.id)).toMatchObject({ box: 0, dueOn: null, reviewCount: 0 })
  })

  it('refuses data from a newer app version', async () => {
    const d = devices()
    await d.remote.drive.create(MANIFEST_FILE, encodeJson({ format: 'mandarin-leitner-sync', version: 99 }))
    await expect(runSync(d.remote.drive, storeA, {})).rejects.toMatchObject({ kind: 'format' })
  })
})

describe('card pictures', () => {
  const picture = (text: string) => ({ blob: new Blob([text], { type: 'image/webp' }), mime: 'image/webp', width: 800, height: 600 })
  const pictureFiles = (d: ReturnType<typeof devices>) => [...d.remote.files.values()].filter((f) => f.name.startsWith('pic-'))

  it('go from A to B with the same id, bytes and size', async () => {
    const d = devices()
    const card = await createCard({ hanzi: '杯子', pinyin: 'bēizi', image: picture('cup-bytes') })
    await d.syncA()
    expect(pictureFiles(d).map((f) => f.name)).toEqual([`pic-${card.imageId}-800x600.webp`])

    await d.syncB()
    const onB = await deviceB.media.get(card.imageId!)
    expect(onB).toMatchObject({ id: card.imageId, mime: 'image/webp', width: 800, height: 600 })
    expect(await onB!.blob.text()).toBe('cup-bytes')
    // Nothing more to move.
    expect((await runSync(d.remote.drive, storeB, await d.syncB())).pictures).toMatchObject({ uploaded: 0, downloaded: 0, removed: 0, left: 0 })
  })

  it('are removed from Drive when no card uses them any more', async () => {
    const d = devices()
    const card = await createCard({ hanzi: '書', pinyin: 'shū', image: picture('book') })
    await d.syncA()
    expect(pictureFiles(d)).toHaveLength(1)
    await deleteCard(card.id)
    await d.syncA()
    expect(pictureFiles(d)).toHaveLength(0)
  })

  it('all move in one sync, reporting how far they are', async () => {
    const d = devices()
    await createCards(Array.from({ length: 45 }, (_, i) => ({ hanzi: `字${i}`, pinyin: 'zì', image: picture(`p${i}`) })))
    const progress: SyncProgress[] = []
    const outcome = await runSync(d.remote.drive, storeA, {}, { onProgress: (p) => progress.push(p) })
    expect(outcome.pictures).toMatchObject({ uploaded: 45, left: 0 })
    expect(pictureFiles(d)).toHaveLength(45)
    expect(progress[0]).toEqual({ step: 'rows' })
    expect(progress[1]).toEqual({ step: 'pictures', done: 0, total: 45 })
    expect(progress.at(-1)).toEqual({ step: 'pictures', done: 45, total: 45 })
  })

  it('stop at the first failure; the rest move on the next sync', async () => {
    const d = devices()
    await createCards(Array.from({ length: 20 }, (_, i) => ({ hanzi: `字${i}`, pinyin: 'zì', image: picture(`p${i}`) })))
    const create = d.remote.drive.create
    let uploads = 0
    d.remote.drive.create = async (name, data) => {
      if (name.startsWith('pic-') && ++uploads > 6) throw new Error('connection lost')
      return create(name, data)
    }
    const first = await d.outcomeA()
    expect(first.pictures.error).toBe('connection lost')
    expect(first.pictures.uploaded).toBeGreaterThanOrEqual(6)
    expect(first.pictures.left).toBe(20 - first.pictures.uploaded)
    d.remote.drive.create = create
    await d.syncA()
    expect(pictureFiles(d)).toHaveLength(20)
  })

  it('stop starting new transfers once the device disconnects', async () => {
    const d = devices()
    await createCards(Array.from({ length: 12 }, (_, i) => ({ hanzi: `字${i}`, pinyin: 'zì', image: picture(`p${i}`) })))
    const controller = new AbortController()
    const outcome = await runSync(d.remote.drive, storeA, {}, {
      signal: controller.signal,
      onProgress: (p) => p.step === 'pictures' && p.done === 2 && controller.abort(),
    })
    expect(outcome.pictures.uploaded).toBeLessThan(12)
    expect(outcome.pictures.left).toBe(12 - outcome.pictures.uploaded)
  })

  it('never undo a finished card sync when they fail', async () => {
    const d = devices()
    await createCard({ hanzi: '燈', pinyin: 'dēng', image: picture('lamp') })
    const create = d.remote.drive.create
    d.remote.drive.create = async (name, data) => {
      if (name.startsWith('pic-')) throw new Error('quota')
      return create(name, data)
    }
    const outcome = await d.outcomeA()
    expect(outcome.pictures.error).toBe('quota')
    expect([...d.remote.files.values()].some((f) => f.name === 'cards.json.gz')).toBe(true)
  })
})
