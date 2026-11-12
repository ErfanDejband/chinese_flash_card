import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ALL_TABLES, AppDB, db as teacherDb } from '@/data/db'
import { createCards, deleteCard, updateCard } from '@/data/repositories/cards'
import { createClassStore, publishSource, saveShare, setLessonHidden } from '@/data/repositories/classStore'
import { createDeck, ensureLessons, updateDeck } from '@/data/repositories/decks'
import type { FetchLike } from '@/import/ai/types'
import { exportClassFile, isClassFile, readClassFile } from './classFile'
import { deriveKey, randomSalt, seal, unseal } from './crypto'
import { createClassDrive, createPublicRead, type ClassDrive, type PublicRead } from './drive'
import { ClassError } from './format'
import { checkClass, markSeen, openClass, takeLessons, unlockClass } from './join'
import { publishClass, stopSharing, unpublishedChanges } from './publish'

/** An in-memory Drive: files with names, parents and a shared flag; public reads see shared files only. */
function fakeDrive() {
  const files = new Map<string, { name: string; data?: Uint8Array; parent?: string; shared: boolean }>()
  const calls = { create: 0, update: 0, share: 0, remove: 0 }
  let seq = 0
  const drive: ClassDrive = {
    createFolder: async (name) => {
      const id = `f${++seq}`
      files.set(id, { name, shared: false })
      return id
    },
    create: async (name, data, parent) => {
      calls.create++
      const id = `f${++seq}`
      files.set(id, { name, data, parent, shared: false })
      return id
    },
    update: async (id, data) => {
      calls.update++
      const f = files.get(id)
      if (!f) throw new ClassError('not-found', 'gone', 404)
      f.data = data
    },
    share: async (id) => {
      calls.share++
      files.get(id)!.shared = true
    },
    remove: async (id) => {
      calls.remove++
      files.delete(id)
      for (const [k, f] of files) if (f.parent === id) files.delete(k)
    },
  }
  const read: PublicRead = async (id) => {
    const f = files.get(id)
    if (!f?.shared || !f.data) throw new ClassError('not-found', 'not shared', 404)
    return f.data
  }
  return { drive, read, files, calls }
}

const studentDb = new AppDB('student-a')
const otherDevice = new AppDB('student-b')
const student = createClassStore(studentDb)
const tables = (d: AppDB) => [d.cards, d.reviewStates, d.media, d.decks, d.lessons]

beforeEach(async () => {
  await Promise.all([...ALL_TABLES(), ...tables(studentDb), ...tables(otherDevice)].map((t) => t.clear()))
})
afterAll(() => {
  studentDb.close()
  otherDevice.close()
})

const picture = (n: number) => ({ blob: new Blob([new Uint8Array([1, 2, n])], { type: 'image/webp' }), mime: 'image/webp', width: 8, height: 8 })

/** A teacher's deck: two lessons, a picture, a hidden lesson. */
async function teacherClass() {
  const deck = await createDeck('Chinese 101', 1000)
  await updateDeck(deck.id, {}, 1000)
  const map = await ensureLessons(deck.id, ['Lesson 1', 'Lesson 2', 'Lesson 3'], 1000)
  const [l1, l2, l3] = [...map.values()]
  await setLessonHidden(l3!.id, true, 1000)
  const cards = await createCards(
    [
      { hanzi: '你好', pinyin: 'nǐhǎo', meaning: 'hello', deckId: deck.id, lessonId: l1!.id, image: picture(1) },
      { hanzi: '謝謝', pinyin: 'xièxie', meaning: 'thanks', deckId: deck.id, lessonId: l1!.id },
      { hanzi: '餐廳', pinyin: 'cāntīng', meaning: 'restaurant', deckId: deck.id, lessonId: l2!.id },
      { hanzi: '秘密', pinyin: 'mìmì', meaning: 'secret', deckId: deck.id, lessonId: l3!.id },
    ],
    2000,
  )
  return { deckId: deck.id, l1: l1!, l2: l2!, l3: l3!, cards }
}

async function publish(drive: ClassDrive, deckId: string, opts: Parameters<typeof publishClass>[2] = {}) {
  const share = await publishClass(drive, (await publishSource(deckId))!, opts)
  await saveShare(deckId, share, opts.now ?? 3000)
  return share
}

describe('publishing a class', () => {
  it('puts the class in a folder of shared files, without hidden lessons, and keeps the link when republished', async () => {
    const d = fakeDrive()
    const t = await teacherClass()
    const share = await publish(d.drive, t.deckId)
    // Folder + 2 lessons + 1 picture + manifest; every file shared.
    expect([...d.files.values()].map((f) => f.name).sort()).toEqual(['Mandarin Leitner · Chinese 101', 'class.json', `lesson-${t.l1.id}`, `lesson-${t.l2.id}`, `pic-${t.cards[0]!.imageId}`].sort())
    expect([...d.files.values()].filter((f) => f.data).every((f) => f.shared)).toBe(true)
    expect(Object.keys(share.lessons)).toEqual([t.l1.id, t.l2.id])

    const deck = (await teacherDb.decks.get(t.deckId))!
    expect(unpublishedChanges(deck, await teacherDb.lessons.toArray(), await teacherDb.cards.toArray())).toBe(0)

    await updateCard(t.cards[2]!.id, { hanzi: '餐廳', pinyin: 'cāntīng', meaning: 'a restaurant' }, undefined, 4000)
    const deck2 = (await teacherDb.decks.get(t.deckId))!
    expect(unpublishedChanges(deck2, await teacherDb.lessons.toArray(), await teacherDb.cards.toArray())).toBe(1)
    const before = { ...d.calls }
    const again = await publish(d.drive, t.deckId, { now: 5000 })
    // Only lesson 2 and the manifest are written again; nothing is created.
    expect(d.calls.update - before.update).toBe(2)
    expect(d.calls.create - before.create).toBe(0)
    expect(again.manifestId).toBe(share.manifestId)
  })

  it('starts over when the teacher deleted the Drive folder', async () => {
    const d = fakeDrive()
    const t = await teacherClass()
    const share = await publish(d.drive, t.deckId)
    await d.drive.remove(share.folderId)
    const again = await publish(d.drive, t.deckId, { now: 6000 })
    expect(again.manifestId).not.toBe(share.manifestId)
    expect(d.files.get(again.manifestId)?.shared).toBe(true)
  })
})

describe('joining a class', () => {
  it('gives the student the lessons they pick, with the teacher’s ids and pictures', async () => {
    const d = fakeDrive()
    const t = await teacherClass()
    const share = await publish(d.drive, t.deckId)

    const opened = await openClass(d.read, share.manifestId)
    expect(opened.body!.lessons.map((l) => l.title)).toEqual(['Lesson 1', 'Lesson 2'])
    await takeLessons(d.read, student, opened, [t.l1.id], { now: 7000 })

    const cards = await studentDb.cards.toArray()
    expect(cards.map((c) => c.hanzi).sort()).toEqual(['你好', '謝謝'])
    expect(cards.every((c) => c.deckId === t.deckId && c.lessonId === t.l1.id)).toBe(true)
    expect(await studentDb.media.get(t.cards[0]!.imageId!)).toBeDefined()
    expect(await studentDb.reviewStates.count()).toBe(2)
    const deck = (await studentDb.decks.get(t.deckId))!
    expect(deck.remote).toMatchObject({ manifestId: share.manifestId, seen: [t.l1.id, t.l2.id] })
    expect(Object.keys(deck.remote!.lessons)).toEqual([t.l1.id])
  })

  it('follows the teacher: edits, removals and new lessons; a card the student removed stays removed', async () => {
    const d = fakeDrive()
    const t = await teacherClass()
    const share = await publish(d.drive, t.deckId)
    await takeLessons(d.read, student, await openClass(d.read, share.manifestId), [t.l1.id, t.l2.id], { now: 7000 })

    // The student removes 謝謝; the teacher edits 你好, removes 餐廳 and shows Lesson 3.
    await studentDb.cards.update(t.cards[1]!.id, { deletedAt: 7500, updatedAt: 7500 })
    await updateCard(t.cards[0]!.id, { hanzi: '你好', pinyin: 'nǐhǎo', meaning: 'hi' }, undefined, 8000)
    await updateCard(t.cards[1]!.id, { hanzi: '謝謝', pinyin: 'xièxie', meaning: 'thank you' }, undefined, 8000)
    await deleteCard(t.cards[2]!.id, 8000)
    await setLessonHidden(t.l3.id, false, 8000)
    await publish(d.drive, t.deckId, { now: 9000 })

    const result = await checkClass(d.read, student, (await studentDb.decks.get(t.deckId))!, 10_000)
    expect(result.newLessons.map((l) => l.title)).toEqual(['Lesson 3'])
    const active = (await studentDb.cards.toArray()).filter((c) => c.deletedAt === undefined)
    expect(active.map((c) => [c.hanzi, c.meaning])).toEqual([['你好', 'hi']])
    expect((await studentDb.cards.get(t.cards[1]!.id))?.deletedAt).toBe(7500)

    // Not now: the new lesson isn't pointed out again. Adding it later works.
    await markSeen(student, t.deckId, [t.l3.id])
    expect((await checkClass(d.read, student, (await studentDb.decks.get(t.deckId))!)).newLessons).toEqual([])
    await takeLessons(d.read, student, await openClass(d.read, share.manifestId), [t.l3.id])
    expect((await studentDb.cards.get(t.cards[3]!.id))?.hanzi).toBe('秘密')
  })

  it('writes the same rows on two of the student’s devices', async () => {
    const d = fakeDrive()
    const t = await teacherClass()
    const share = await publish(d.drive, t.deckId)
    await takeLessons(d.read, student, await openClass(d.read, share.manifestId), [t.l1.id], { now: 7000 })
    await takeLessons(d.read, createClassStore(otherDevice), await openClass(d.read, share.manifestId), [t.l1.id], { now: 9000 })
    const rows = async (x: AppDB) => (await x.cards.toArray()).sort((a, b) => (a.id < b.id ? -1 : 1))
    expect(await rows(otherDevice)).toEqual(await rows(studentDb))
  })

  it('marks the class stopped when the teacher stops sharing; the cards stay', async () => {
    const d = fakeDrive()
    const t = await teacherClass()
    const share = await publish(d.drive, t.deckId)
    await takeLessons(d.read, student, await openClass(d.read, share.manifestId), [t.l1.id])
    await stopSharing(d.drive, share)
    expect((await checkClass(d.read, student, (await studentDb.decks.get(t.deckId))!)).stopped).toBe(true)
    expect((await studentDb.decks.get(t.deckId))!.remote!.stopped).toBe(true)
    expect(await studentDb.cards.count()).toBe(2)
  })

  it('refuses the teacher’s own class', async () => {
    const d = fakeDrive()
    const t = await teacherClass()
    const share = await publish(d.drive, t.deckId)
    await expect(takeLessons(d.read, createClassStore(teacherDb), await openClass(d.read, share.manifestId), [t.l1.id])).rejects.toThrow('your own class')
  })
})

describe('a class with a password', () => {
  it('is encrypted: the link alone shows only its title, the password opens it', async () => {
    const d = fakeDrive()
    const t = await teacherClass()
    const salt = randomSalt()
    const lock = { salt, iterations: 1000, key: await deriveKey('pa55', salt, 1000) }
    const share = await publish(d.drive, t.deckId, { lock })

    const opened = await openClass(d.read, share.manifestId)
    expect(opened.manifest.title).toBe('Chinese 101')
    expect(opened.body).toBeUndefined()
    await expect(unlockClass(opened, 'wrong')).rejects.toMatchObject({ kind: 'password' })
    const unlocked = await unlockClass(opened, 'pa55')
    await takeLessons(d.read, student, unlocked, [t.l1.id])
    expect(await studentDb.cards.count()).toBe(2)
    expect((await studentDb.decks.get(t.deckId))!.remote!.key).toBe(lock.key)

    // Removing the password re-sends every part unencrypted.
    const before = d.calls.update
    await publish(d.drive, t.deckId, { now: 9000 })
    expect(d.calls.update - before).toBe(4)
    expect((await openClass(d.read, share.manifestId)).body).toBeDefined()
  })

  it('seals and opens bytes only with the right key', async () => {
    const key = await deriveKey('x', randomSalt(), 1000)
    const sealed = await seal(new Uint8Array([1, 2, 3]), key)
    expect([...(await unseal(sealed, key))]).toEqual([1, 2, 3])
    await expect(unseal(sealed, await deriveKey('y', randomSalt(), 1000))).rejects.toThrow()
  })
})

describe('class files', () => {
  it('carry a class to another device without Drive', async () => {
    const t = await teacherClass()
    const bytes = await exportClassFile((await publishSource(t.deckId))!, 5000)
    expect(isClassFile(bytes)).toBe(true)
    const { opened, read } = readClassFile(bytes)
    await takeLessons(read, student, opened, opened.body!.lessons.map((l) => l.id))
    expect((await studentDb.cards.toArray()).map((c) => c.hanzi).sort()).toEqual(['你好', '謝謝', '餐廳'])
    expect(await studentDb.media.count()).toBe(1)
    expect((await studentDb.decks.get(t.deckId))!.remote!.manifestId).toBe('')
  })
})

describe('the Drive client', () => {
  const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it('explains when an account may not share by link', async () => {
    const fetchImpl: FetchLike = async () => reply(403, { error: { message: 'The user does not have sufficient permissions', errors: [{ reason: 'insufficientFilePermissions' }] } })
    const drive = createClassDrive(() => 'token', fetchImpl)
    await expect(drive.share('id')).rejects.toMatchObject({ kind: 'sharing-blocked' })
  })

  it('reads shared files with the public key, and calls a missing one gone', async () => {
    const seen: string[] = []
    const fetchImpl: FetchLike = async (url) => {
      seen.push(String(url))
      return String(url).includes('/missing') ? reply(404) : new Response(new Uint8Array([7]))
    }
    const read = createPublicRead('KEY', fetchImpl)
    expect([...(await read('abc'))]).toEqual([7])
    expect(seen[0]).toBe('https://www.googleapis.com/drive/v3/files/abc?alt=media&key=KEY')
    await expect(read('missing')).rejects.toMatchObject({ kind: 'not-found' })
  })
})
