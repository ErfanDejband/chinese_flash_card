import { SyncError, type DriveLike, type PictureStore, type RemoteFile } from './types'

/**
 * Card pictures in the Drive app folder (sync step 2): one file per picture, named
 * `pic-<id>-<w>x<h>.<ext>`. Pictures never change (a new picture gets a new id), so a file is
 * only ever created or deleted, never rewritten.
 */

/** Pictures moved at the same time: much faster on a phone than one by one, and gentle on Drive. */
export const PICTURE_CONCURRENCY = 4

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' }
const MIME: Record<string, string> = Object.fromEntries(Object.entries(EXT).map(([mime, ext]) => [ext, mime]))

/** A size that always reads back (a picture without a valid size would otherwise be uploaded again on every sync). */
const px = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0)

export function pictureFileName(p: { id: string; mime: string; width: number; height: number }): string {
  return `pic-${p.id}-${px(p.width)}x${px(p.height)}.${EXT[p.mime] ?? 'jpg'}`
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
  /** Why the transfer stopped early (the cards are synced anyway). */
  error?: string
}

/** How far the picture transfer is: `done` of `total` uploads, downloads and removals. */
export interface PictureProgress {
  done: number
  total: number
}

export interface PictureSyncOptions {
  onProgress?: (progress: PictureProgress) => void
  /** Stops starting new transfers (the device was disconnected). */
  signal?: AbortSignal
  concurrency?: number
}

/**
 * After the cards are merged: upload the pictures cards use that Drive lacks, download the ones
 * this device lacks, and delete the Drive pictures no card uses any more (deleted cards, replaced
 * pictures). Self-healing: a device that still uses a removed picture uploads it again.
 * The first failure stops the transfer (what's done stays done; the next sync carries on); an
 * expired sign-in is thrown.
 */
export async function syncPictures(drive: DriveLike, store: PictureStore, remote: Iterable<RemoteFile>, options: PictureSyncOptions = {}): Promise<PictureSyncResult> {
  const { onProgress, signal, concurrency = PICTURE_CONCURRENCY } = options
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
  const result: PictureSyncResult = { uploaded: 0, downloaded: 0, removed: 0, left: 0 }

  const tasks: (() => Promise<void>)[] = [
    ...[...used]
      .filter((id) => stored.has(id) && !onDrive.has(id))
      .map((id) => async () => {
        const picture = await store.get(id)
        if (!picture) return
        await drive.create(pictureFileName(picture), new Uint8Array(await picture.blob.arrayBuffer()))
        result.uploaded++
      }),
    ...[...used]
      .filter((id) => !stored.has(id) && onDrive.has(id))
      .map((id) => async () => {
        const p = onDrive.get(id)!
        const bytes = await drive.download(p.file.id)
        await store.put({ id, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: p.mime }), mime: p.mime, width: p.width, height: p.height, createdAt: Date.now() })
        result.downloaded++
      }),
    ...[...[...onDrive].filter(([id]) => !used.has(id)).map(([, p]) => p.file), ...extra].map((file) => async () => {
      await drive.remove(file.id)
      result.removed++
    }),
  ]

  let next = 0
  let done = 0
  let failure: { error: unknown } | undefined
  onProgress?.({ done, total: tasks.length })
  const worker = async () => {
    while (!failure && !signal?.aborted && next < tasks.length) {
      const task = tasks[next++]!
      try {
        await task()
        done++
        onProgress?.({ done, total: tasks.length })
      } catch (error) {
        failure ??= { error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))

  result.left = tasks.length - done
  if (failure) {
    if (failure.error instanceof SyncError && failure.error.kind === 'auth') throw failure.error
    result.error = failure.error instanceof Error ? failure.error.message : 'Pictures could not be synced.'
  }
  return result
}
