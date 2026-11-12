import { unzipSync, zipSync, type Zippable } from 'fflate'
import type { Timestamp } from '@/domain/types'
import type { PublicRead } from './drive'
import { buildManifest, ClassError, encodeJson, packLessons, parseManifest, type ClassBody, type ClassPictureInfo } from './format'
import type { OpenedClass } from './join'
import type { PublishSource } from './publish'

/**
 * A class as one file (.zip): the same manifest, lesson and picture parts as a shared class, for
 * sending by LINE, e-mail or Google Classroom, or for opening offline. No password and no updates:
 * opening a newer file of the same class updates it.
 */
const MANIFEST = 'class.json'

export async function exportClassFile(src: PublishSource, now: Timestamp = Date.now()): Promise<Uint8Array> {
  const packed = packLessons(src.deck, src.lessons, src.cards)
  const files: Zippable = {}
  const pictures: Record<string, ClassPictureInfo> = {}
  for (const id of new Set(packed.flatMap((l) => l.cards.flatMap((c) => (c.imageId ? [c.imageId] : []))))) {
    const media = await src.picture(id)
    if (!media) continue
    const file = `pictures/${id}`
    // Pictures are already compressed: stored as they are.
    files[file] = [media.data, { level: 0 }]
    pictures[id] = { mime: media.mime, width: media.width, height: media.height, file }
  }
  for (const l of packed) files[`lessons/${l.id}`] = encodeJson({ cards: l.cards.map((c) => (c.imageId && !pictures[c.imageId] ? { ...c, imageId: undefined } : c)) })
  const body: ClassBody = {
    ...(src.deck.description ? { description: src.deck.description } : {}),
    lessons: packed.map((l) => ({ id: l.id, title: l.title, order: l.order, hash: l.hash, cards: l.cards.length, file: `lessons/${l.id}` })),
    pictures,
  }
  files[MANIFEST] = encodeJson(await buildManifest(src.deck, body, undefined, now))
  return zipSync(files)
}

/** A zip with a class manifest in it (a backup zip has none). */
export function isClassFile(bytes: Uint8Array): boolean {
  try {
    return MANIFEST in unzipSync(bytes, { filter: (f) => f.name === MANIFEST })
  } catch {
    return false
  }
}

/** Open a class file: the class, and a reader for its parts (in place of Drive). */
export function readClassFile(bytes: Uint8Array): { opened: OpenedClass; read: PublicRead } {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new ClassError('format', 'This isn’t a class file.')
  }
  if (!files[MANIFEST]) throw new ClassError('format', 'This isn’t a class file.')
  const manifest = parseManifest(files[MANIFEST])
  const read: PublicRead = async (path) => {
    const part = files[path]
    if (!part) throw new ClassError('not-found', `The class file is missing ${path}.`)
    return part
  }
  return { opened: { manifestId: '', manifest, ...(manifest.body ? { body: manifest.body } : {}) }, read }
}
