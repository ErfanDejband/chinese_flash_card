import type { Card, ClassLock, Deck, DeckShare, Id, Lesson, Timestamp } from '@/domain/types'
import type { ClassDrive } from './drive'
import { buildManifest, ClassError, classDetails, encodeJson, encodePart, hashOf, packLessons, type ClassBody, type ClassPictureInfo } from './format'

/** A card picture as this device stores it. */
export interface PictureData {
  data: Uint8Array
  mime: string
  width: number
  height: number
}

export interface PublishSource {
  deck: Deck
  lessons: readonly Lesson[]
  cards: readonly Card[]
  picture(id: Id): Promise<PictureData | undefined>
}

export interface PublishOptions {
  /** The class password's lock; none = an open class. */
  lock?: ClassLock
  now?: Timestamp
  onProgress?(done: number, total: number): void
}

const PARALLEL = 4

async function inBatches<T>(items: readonly T[], run: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += PARALLEL) await Promise.all(items.slice(i, i + PARALLEL).map(run))
}

/**
 * Publish a deck as a class in the teacher's Drive, or bring the shared class up to date. Only
 * lessons whose cards changed and pictures not uploaded yet are sent; lessons and pictures no
 * longer used are removed; the class file (manifest) is written last, in place, so the link
 * stays the same. A new or changed password re-sends everything, encrypted with the new key.
 * When the Drive files are gone (the teacher deleted the folder), it starts over once.
 */
export async function publishClass(drive: ClassDrive, src: PublishSource, opts: PublishOptions = {}): Promise<DeckShare> {
  try {
    return await publish(drive, src, src.deck.share, opts)
  } catch (e) {
    if (e instanceof ClassError && e.kind === 'not-found' && src.deck.share) return publish(drive, src, undefined, opts)
    throw e
  }
}

async function publish(drive: ClassDrive, src: PublishSource, prev: DeckShare | undefined, opts: PublishOptions): Promise<DeckShare> {
  const { deck } = src
  const now = opts.now ?? Date.now()
  const lock = opts.lock
  const key = lock?.key
  const relock = (prev?.lock?.salt ?? '') !== (lock?.salt ?? '')
  const packed = packLessons(deck, src.lessons, src.cards)

  const pictureIds = [...new Set(packed.flatMap((l) => l.cards.flatMap((c) => (c.imageId ? [c.imageId] : []))))]
  const keepPicture = (id: Id) => !!prev?.pictures[id] && !relock
  const keepLesson = (id: Id, hash: string) => prev?.lessons[id]?.hash === hash && !relock
  const total = pictureIds.filter((id) => !keepPicture(id)).length + packed.filter((l) => !keepLesson(l.id, l.hash)).length + 1
  let done = 0
  const step = () => opts.onProgress?.(++done, total)
  opts.onProgress?.(0, total)

  const folderId = prev?.folderId ?? (await drive.createFolder(`Mandarin Leitner · ${deck.title}`))
  const createShared = async (name: string, data: Uint8Array) => {
    const id = await drive.create(name, data, folderId)
    await drive.share(id)
    return id
  }

  // Pictures first: the lessons point to them.
  const pictures: Record<Id, string> = {}
  const pictureInfo: Record<Id, ClassPictureInfo> = {}
  await inBatches(pictureIds, async (id) => {
    const media = await src.picture(id)
    if (!media) return // Not on this device (still syncing): the card is shared without it for now.
    let file = prev?.pictures[id]
    if (!file || relock) {
      const data = await encodePart(media.data, key)
      file = file ? (await drive.update(file, data), file) : await createShared(`pic-${id}`, data)
      step()
    }
    pictures[id] = file
    pictureInfo[id] = { mime: media.mime, width: media.width, height: media.height, file }
  })

  const lessons: DeckShare['lessons'] = {}
  for (const l of packed) {
    const old = prev?.lessons[l.id]
    if (old && keepLesson(l.id, l.hash)) {
      lessons[l.id] = old
      continue
    }
    // Cards whose picture isn't shared don't point to one.
    const cards = l.cards.map((c) => (c.imageId && !pictures[c.imageId] ? { ...c, imageId: undefined } : c))
    const data = await encodePart(encodeJson({ cards }), key)
    const file = old ? (await drive.update(old.file, data), old.file) : await createShared(`lesson-${l.id}`, data)
    lessons[l.id] = { file, hash: l.hash }
    step()
  }

  const body: ClassBody = {
    ...(deck.description ? { description: deck.description } : {}),
    lessons: packed.map((l) => ({ id: l.id, title: l.title, order: l.order, hash: l.hash, cards: l.cards.length, file: lessons[l.id]!.file })),
    pictures: pictureInfo,
  }
  const manifest = encodeJson(await buildManifest(deck, body, lock, now))
  const manifestId = prev?.manifestId ? (await drive.update(prev.manifestId, manifest), prev.manifestId) : await createShared('class.json', manifest)
  step()

  // Clean up what the class no longer uses.
  const unused = [
    ...Object.entries(prev?.lessons ?? {}).flatMap(([id, l]) => (lessons[id] ? [] : [l.file])),
    ...Object.entries(prev?.pictures ?? {}).flatMap(([id, file]) => (pictures[id] ? [] : [file])),
  ]
  await inBatches(unused, (file) => drive.remove(file))

  return { folderId, manifestId, lessons, pictures, manifestHash: hashOf(classDetails(deck, packed)), ...(lock ? { lock } : {}), publishedAt: now }
}

/** How many lessons (plus the class details) changed since the class was last published; 0 = up to date. */
export function unpublishedChanges(deck: Deck, lessons: readonly Lesson[], cards: readonly Card[]): number {
  const share = deck.share
  if (!share) return 0
  const packed = packLessons(deck, lessons, cards)
  const changed = packed.filter((l) => share.lessons[l.id]?.hash !== l.hash).length
  const removed = Object.keys(share.lessons).filter((id) => !packed.some((l) => l.id === id)).length
  const details = hashOf(classDetails(deck, packed)) !== share.manifestHash ? 1 : 0
  return changed + removed || details
}

/** Stop sharing: the folder goes, with every class file in it. Students keep the cards they have. */
export async function stopSharing(drive: ClassDrive, share: DeckShare): Promise<void> {
  await drive.remove(share.folderId)
}
