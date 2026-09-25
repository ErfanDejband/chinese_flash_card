import { newId } from '@/domain/ids'
import type { Id } from '@/domain/types'
import { db, type MediaRecord } from '../db'

export type NewMedia = Pick<MediaRecord, 'blob' | 'mime' | 'width' | 'height'>

export async function putMedia(media: NewMedia, now = Date.now()): Promise<Id> {
  const id = newId()
  await db.media.add({ ...media, id, createdAt: now })
  return id
}

export function getMedia(id: Id): Promise<MediaRecord | undefined> {
  return db.media.get(id)
}

export function deleteMedia(id: Id): Promise<void> {
  return db.media.delete(id)
}
