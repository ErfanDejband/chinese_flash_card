import type { DriveLike, PictureStore, RemoteFile } from './types'

/**
 * Card pictures in the Drive app folder (sync step 2): one file per picture, named
 * `pic-<id>-<w>x<h>.<ext>`. Pictures never change (a new picture gets a new id), so a file is
 * only ever created or deleted, never rewritten.
 */

/** At most this many pictures move per sync, so every run stays short; the rest go next time. */
export const PICTURE_BATCH = 40

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' }
const MIME: Record<string, string> = Object.fromEntries(Object.entries(EXT).map(([mime, ext]) => [ext, mime]))

export function pictureFileName(p: { id: string; mime: string; width: number; height: number }): string {
  return `pic-${p.id}-${Math.round(p.width)}x${Math.round(p.height)}.${EXT[p.mime] ?? 'jpg'}`
}

export function parsePictureFileName(name: string): { id: string; mime: string; width: number; height: number } | null {
  const m = /^pic-(.+)-(\d+)x(\d+)\.([a-z]+)$/.exec(name)
  const mime = m && MIME[m[4]!]
  return m && mime ? { id: m[1]!, mime, width: Number(m[2]), height: Number(m[3]) } : null
}

export interface PictureSyncResult {
  uploaded: number
  downloaded: number
  removed: number
  /** Pictures still to move or remove: the next sync carries on. */
  left: number
}

/**
 * After the cards are merged: upload the pictures cards use that Drive lacks, download the ones
 * this device lacks, and delete the Drive pictures no card uses any more (deleted cards, replaced
 * pictures). Self-healing: a device that still uses a removed picture uploads it again.
 */
export async function syncPictures(drive: DriveLike, store: PictureStore, remote: Iterable<RemoteFile>, limit = PICTURE_BATCH): Promise<PictureSyncResult> {
  const onDrive = new Map<string, { file: RemoteFile; mime: string; width: number; height: number }>()
  // A second copy of a picture (two devices uploading it at once) is removed too.
  const extra: RemoteFile[] = []
  for (const file of remote) {
    const parsed = parsePictureFileName(file.name)
    if (!parsed) continue
    if (onDrive.has(parsed.id)) extra.push(file)
    else onDrive.set(parsed.id, { file, ...parsed })
  }
  const { used, stored } = await store.ids()
  const upload = [...used].filter((id) => stored.has(id) && !onDrive.has(id))
  const download = [...used].filter((id) => !stored.has(id) && onDrive.has(id))
  const remove = [...[...onDrive].filter(([id]) => !used.has(id)).map(([, p]) => p.file), ...extra]

  let budget = limit
  const take = <T>(list: T[]) => list.splice(0, Math.max(0, Math.min(budget, list.length)))
  const result: PictureSyncResult = { uploaded: 0, downloaded: 0, removed: 0, left: 0 }

  for (const id of take(upload)) {
    budget--
    const picture = await store.get(id)
    if (!picture) continue
    await drive.create(pictureFileName(picture), new Uint8Array(await picture.blob.arrayBuffer()))
    result.uploaded++
  }
  for (const id of take(download)) {
    budget--
    const p = onDrive.get(id)!
    const bytes = await drive.download(p.file.id)
    await store.put({ id, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: p.mime }), mime: p.mime, width: p.width, height: p.height, createdAt: Date.now() })
    result.downloaded++
  }
  for (const file of take(remove)) {
    budget--
    await drive.remove(file.id)
    result.removed++
  }
  result.left = upload.length + download.length + remove.length
  return result
}
