import type { Deck, Id, Timestamp } from '@/domain/types'
import { planClass, type ClassPlan, type FetchedLesson, type LocalClass } from './apply'
import { deriveKey } from './crypto'
import type { PublicRead } from './drive'
import { ClassError, decodeJson, decodePart, openBody, parseManifest, type ClassBody, type ClassCard, type ClassLessonInfo, type ClassManifest } from './format'

/** A card picture to store (the teacher's media id, so updates find it again). */
export interface ClassPicture {
  id: Id
  blob: Blob
  mime: string
  width: number
  height: number
}

/** This device's side of joining and updating classes (data/repositories/classStore.ts). */
export interface ClassStore {
  local(deckId: Id, cardIds: readonly Id[]): Promise<LocalClass>
  /** Writes the plan, review states for added cards, and pictures this device lacks, in one go. */
  write(plan: ClassPlan, pictures: readonly ClassPicture[]): Promise<void>
  storedPictures(ids: readonly Id[]): Promise<Set<Id>>
  nextDeckOrder(): Promise<number>
}

/** An opened class: its manifest, and its body once unlocked. */
export interface OpenedClass {
  manifestId: string
  manifest: ClassManifest
  body?: ClassBody
  key?: string
}

export async function openClass(read: PublicRead, manifestId: string): Promise<OpenedClass> {
  const manifest = parseManifest(await read(manifestId))
  return { manifestId, manifest, ...(manifest.body ? { body: manifest.body } : {}) }
}

/** Unlock a locked class with its password; a wrong one throws ClassError('password'). */
export async function unlockClass(opened: OpenedClass, password: string): Promise<OpenedClass> {
  const lock = opened.manifest.lock
  if (!lock) return opened
  const key = await deriveKey(password, lock.salt, lock.iterations)
  try {
    return { ...opened, body: await openBody(opened.manifest, key), key }
  } catch {
    throw new ClassError('password', 'That password doesn’t open this class.')
  }
}

async function fetchLesson(read: PublicRead, info: ClassLessonInfo, key?: string): Promise<FetchedLesson> {
  if (!info.file) throw new ClassError('format', `Lesson “${info.title}” is missing from the class.`)
  const { cards } = decodeJson<{ cards: ClassCard[] }>(await decodePart(await read(info.file), key))
  return { info, cards }
}

export interface Progress {
  done: number
  total: number
}

/**
 * Fetch these lessons (and the pictures this device lacks) and write them as one deck. Used to
 * join a class, to add lessons later, and to apply a teacher's changes.
 */
export async function takeLessons(
  read: PublicRead,
  store: ClassStore,
  opened: OpenedClass,
  lessonIds: readonly Id[],
  opts: { now?: Timestamp; onProgress?(p: Progress): void; seen?: readonly Id[] } = {},
): Promise<ClassPlan> {
  const body = opened.body
  if (!body) throw new ClassError('password', 'This class needs its password.')
  const now = opts.now ?? Date.now()
  const local0 = await store.local(opened.manifest.id, [])
  if (local0.deck?.share) throw new ClassError('other', 'This is your own class: it’s already in your decks.')
  if (local0.deck && !local0.deck.remote && local0.deck.deletedAt === undefined) throw new ClassError('other', 'A deck of yours already uses this class’s id.')

  const infos = body.lessons.filter((l) => lessonIds.includes(l.id))
  const fetched: FetchedLesson[] = []
  const report = (done: number, total: number) => opts.onProgress?.({ done, total })
  for (const [i, info] of infos.entries()) {
    report(i, infos.length + 1)
    fetched.push(await fetchLesson(read, info, opened.key))
  }

  const local = await store.local(
    opened.manifest.id,
    fetched.flatMap((f) => f.cards.map((c) => c.id)),
  )
  const before = local.deck?.deletedAt === undefined ? Object.keys(local.deck?.remote?.lessons ?? {}) : []
  const plan = planClass({
    manifest: opened.manifest,
    body,
    manifestId: opened.manifestId,
    key: opened.key,
    local,
    fetched,
    taken: [...new Set([...before, ...lessonIds])],
    seen: opts.seen,
    order: local.deck?.order ?? (await store.nextDeckOrder()),
    now,
  })

  const have = await store.storedPictures(plan.pictures)
  const missing = plan.pictures.filter((id) => !have.has(id))
  const pictures: ClassPicture[] = []
  for (const [i, id] of missing.entries()) {
    report(infos.length + i / Math.max(1, missing.length), infos.length + 1)
    const info = body.pictures[id]
    if (!info?.file) continue
    try {
      const data = await decodePart(await read(info.file), opened.key)
      pictures.push({ id, blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: info.mime }), mime: info.mime, width: info.width, height: info.height })
    } catch (e) {
      // A picture that can't be fetched leaves its card without one; anything else stops.
      if (!(e instanceof ClassError && e.kind === 'not-found')) throw e
    }
  }
  await store.write(plan, pictures)
  report(1, 1)
  return plan
}

export interface ClassCheck {
  /** Lessons the class has that the student hasn't taken and hasn't seen before. */
  newLessons: ClassLessonInfo[]
  /** Card rows written (changed, added or removed). */
  changed: number
  stopped: boolean
}

/**
 * A joined class: look at the teacher's class file and apply changes to the lessons taken.
 * New lessons are only pointed out (the student chooses); a class no longer shared is marked stopped.
 */
export async function checkClass(read: PublicRead, store: ClassStore, deck: Deck, now = Date.now()): Promise<ClassCheck> {
  const remote = deck.remote
  if (!remote?.manifestId) return { newLessons: [], changed: 0, stopped: false }
  let opened: OpenedClass
  try {
    opened = await openClass(read, remote.manifestId)
  } catch (e) {
    if (e instanceof ClassError && e.kind === 'not-found') {
      const local = await store.local(deck.id, [])
      if (local.deck?.remote && !local.deck.remote.stopped) await store.write({ deck: { ...local.deck, remote: { ...local.deck.remote, stopped: true }, updatedAt: now }, lessons: [], cards: [], added: [], pictures: [] }, [])
      return { newLessons: [], changed: 0, stopped: true }
    }
    throw e
  }
  if (opened.manifest.lock) {
    if (!remote.key) return { newLessons: [], changed: 0, stopped: false }
    opened = { ...opened, body: await openBody(opened.manifest, remote.key), key: remote.key }
  }
  const body = opened.body!
  const taken = Object.keys(remote.lessons)
  const changedLessons = body.lessons.filter((l) => taken.includes(l.id) && remote.lessons[l.id] !== l.hash).map((l) => l.id)
  const gone = taken.some((id) => !body.lessons.some((l) => l.id === id))
  const details = deck.title !== opened.manifest.title || (deck.teacher ?? '') !== (opened.manifest.teacher ?? '') || !!remote.stopped
  const newLessons = body.lessons.filter((l) => !taken.includes(l.id) && !remote.seen.includes(l.id))
  let changed = 0
  // New lessons stay unseen until the student adds them or says not now (markSeen).
  if (changedLessons.length || gone || details) changed = (await takeLessons(read, store, opened, changedLessons, { now, seen: remote.seen })).cards.length
  return { newLessons, changed, stopped: false }
}

/** The student looked at the class's new lessons (and didn't add them): stop pointing them out. */
export async function markSeen(store: ClassStore, deckId: Id, lessonIds: readonly Id[], now = Date.now()): Promise<void> {
  const { deck } = await store.local(deckId, [])
  if (!deck?.remote) return
  const seen = [...new Set([...deck.remote.seen, ...lessonIds])]
  await store.write({ deck: { ...deck, remote: { ...deck.remote, seen }, updatedAt: now }, lessons: [], cards: [], added: [], pictures: [] }, [])
}
