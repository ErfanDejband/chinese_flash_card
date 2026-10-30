import { mergeLog, mergeTombstones, mergeVersioned, preferLocal, type Tombstone, type Versioned } from '@/domain/sync/merge'
import type { ReviewLogEntry } from '@/domain/types'
import { syncPictures, type PictureProgress, type PictureSyncResult } from './pictures'
import { decodeJson, encodeJson, hashRows, isDataFile, isLogFile, logFileName, logMonth, MANIFEST_FILE, SYNC_FORMAT, SYNC_VERSION, TABLE_FILES, type Manifest } from './snapshot'
import { SyncError, type DriveLike, type LocalChanges, type LocalSnapshot, type LocalStore, type RemoteFile, type SyncFiles } from './types'

export interface SyncOutcome {
  files: SyncFiles
  downloaded: number
  uploaded: number
  /** Rows written on this device. */
  localChanges: number
  /** Card pictures moved; `error` when they couldn't (the cards are synced anyway). */
  pictures: PictureSyncResult
}

/** What a sync is doing, for a progress bar: the rows (quick), then the pictures (counted). */
export type SyncProgress = { step: 'rows' } | ({ step: 'pictures' } & PictureProgress)

export interface SyncOptions {
  onProgress?: (progress: SyncProgress) => void
  /** Stops the picture transfer early (the device was disconnected). */
  signal?: AbortSignal
}

/** Pictures after the rows: a picture failure never undoes a finished row sync; the next run retries. */
async function withPictures(drive: DriveLike, store: LocalStore, remote: Map<string, RemoteFile>, { onProgress, signal }: SyncOptions): Promise<PictureSyncResult> {
  try {
    return await syncPictures(drive, store.pictures, remote.values(), { signal, onProgress: onProgress && ((p) => onProgress({ step: 'pictures', ...p })) })
  } catch (e) {
    if (e instanceof SyncError && e.kind === 'auth') throw e
    return { uploaded: 0, downloaded: 0, removed: 0, left: 0, error: e instanceof Error ? e.message : 'Pictures could not be synced.' }
  }
}

type Rows = { id: string }[]

/** This device's rows, file by file. */
function localFiles(local: LocalSnapshot): Map<string, Rows> {
  const files = new Map<string, Rows>([
    [TABLE_FILES.tombstones, local.tombstones],
    [TABLE_FILES.cards, local.cards],
    [TABLE_FILES.states, local.states],
    [TABLE_FILES.imports, local.imports],
    [TABLE_FILES.settings, local.settings],
    [TABLE_FILES.known, local.known],
  ])
  for (const e of local.log) {
    const name = logFileName(logMonth(e.at))
    const shard = files.get(name) ?? []
    shard.push(e)
    files.set(name, shard)
  }
  return files
}

/** `cards.json.gz` → `cards`. */
function tableKey(name: string): keyof typeof TABLE_FILES {
  return (Object.keys(TABLE_FILES) as (keyof typeof TABLE_FILES)[]).find((k) => TABLE_FILES[k] === name)!
}

const emptySnapshot = (): LocalSnapshot => ({ cards: [], states: [], imports: [], settings: [], tombstones: [], known: [], log: [] })

const emptyChanges = (): LocalChanges => ({ cards: [], states: [], imports: [], settings: [], tombstones: [], known: [], logAdds: [], logDeletes: [] })

const changeCount = (c: LocalChanges) =>
  c.cards.length +
  c.states.length +
  c.imports.length +
  c.settings.length +
  c.tombstones.length +
  c.known.length +
  c.logAdds.length +
  c.logDeletes.length

async function listRemote(drive: DriveLike): Promise<Map<string, RemoteFile>> {
  return new Map((await drive.list()).map((f) => [f.name, f]))
}

async function checkManifest(drive: DriveLike, remote: Map<string, RemoteFile>, previous: SyncFiles): Promise<void> {
  const file = remote.get(MANIFEST_FILE)
  if (!file || previous[MANIFEST_FILE]?.version === file.version) return
  const manifest = decodeJson<Partial<Manifest>>(await drive.download(file.id))
  if (manifest.format !== SYNC_FORMAT) throw new SyncError('format', 'The Drive app folder holds data this app does not recognise.')
  if (typeof manifest.version !== 'number' || manifest.version > SYNC_VERSION) {
    throw new SyncError('format', 'Your data was synced by a newer version of the app. Update the app on this device first.')
  }
}

/** What the Drive copy holds, for the first-sync choice. */
export async function inspectRemote(drive: DriveLike): Promise<{ hasData: boolean; cards: number }> {
  const remote = await listRemote(drive)
  const file = remote.get(TABLE_FILES.cards)
  if (!file) return { hasData: [...remote.keys()].some(isDataFile), cards: 0 }
  const cards = decodeJson<{ deletedAt?: number }[]>(await drive.download(file.id))
  return { hasData: true, cards: cards.filter((c) => c.deletedAt === undefined).length }
}

/**
 * Two-way sync: for each file, merge this device's rows with the Drive copy, write what's new
 * here, and upload when the merged file differs from the Drive one. Files unchanged on both
 * sides since the last sync are skipped. Safe to repeat or interrupt: merging is idempotent.
 */
export async function runSync(drive: DriveLike, store: LocalStore, previous: SyncFiles, options: SyncOptions = {}): Promise<SyncOutcome> {
  options.onProgress?.({ step: 'rows' })
  const remote = await listRemote(drive)
  await checkManifest(drive, remote, previous)
  const local = localFiles(await store.read())

  // Tombstones first: the log files need the full set of deleted entries.
  const names = [...new Set([...local.keys(), ...[...remote.keys()].filter(isDataFile)])].sort((a, b) =>
    a === TABLE_FILES.tombstones ? -1 : b === TABLE_FILES.tombstones ? 1 : a.localeCompare(b),
  )

  const changes = emptyChanges()
  const files: SyncFiles = {}
  const uploads: { name: string; rows: Rows; hash: string; file?: RemoteFile }[] = []
  let deleted = new Set<string>()
  let downloaded = 0

  for (const name of names) {
    const mine = local.get(name) ?? []
    const file = remote.get(name)
    const prev = previous[name]
    const hash = hashRows(mine)
    const hasDeleted = isLogFile(name) && mine.some((e) => deleted.has(e.id))
    if (file && prev?.id === file.id && prev.version === file.version && prev.hash === hash && !hasDeleted) {
      // Unchanged here and on Drive since the last sync.
      files[name] = prev
      if (name === TABLE_FILES.tombstones) deleted = new Set(mine.map((t) => t.id))
      continue
    }

    let theirs: Rows = []
    if (file) {
      theirs = decodeJson<Rows>(await drive.download(file.id))
      downloaded++
    }

    let merged: Rows
    if (name === TABLE_FILES.tombstones) {
      const r = mergeTombstones(mine as Tombstone[], theirs as Tombstone[])
      changes.tombstones.push(...r.localUpdates)
      deleted = new Set(r.merged.map((t) => t.id))
      merged = r.merged
    } else if (isLogFile(name)) {
      const r = mergeLog(mine as ReviewLogEntry[], theirs as ReviewLogEntry[], deleted)
      changes.logAdds.push(...r.localAdds)
      changes.logDeletes.push(...r.localDeletes)
      merged = r.merged
    } else {
      const r = mergeVersioned(mine as Versioned[], theirs as Versioned[])
      ;(changes[tableKey(name) as 'cards'] as Versioned[]).push(...r.localUpdates)
      merged = r.merged
    }

    const mergedHash = hashRows(merged)
    if (file && mergedHash === hashRows(theirs)) files[name] = { id: file.id, version: file.version, hash: mergedHash }
    else if (merged.length > 0 || file) uploads.push({ name, rows: merged, hash: mergedHash, file })
  }

  const localChanges = changeCount(changes)
  if (localChanges > 0) await store.apply(changes)

  for (const u of uploads) {
    const data = encodeJson(u.rows)
    const saved = u.file ? await drive.update(u.file.id, data) : await drive.create(u.name, data)
    files[u.name] = { id: saved.id, version: saved.version, hash: u.hash }
  }

  const manifest = remote.get(MANIFEST_FILE) ?? (uploads.length ? await drive.create(MANIFEST_FILE, encodeJson({ format: SYNC_FORMAT, version: SYNC_VERSION })) : undefined)
  if (manifest) files[MANIFEST_FILE] = { id: manifest.id, version: manifest.version, hash: '' }

  return { files, downloaded, uploaded: uploads.length, localChanges, pictures: await withPictures(drive, store, remote, options) }
}

/** First sync, "use the Drive copy": this device's synced data becomes exactly the Drive copy. */
export async function replaceLocalFromRemote(drive: DriveLike, store: LocalStore, options: SyncOptions = {}): Promise<SyncOutcome> {
  options.onProgress?.({ step: 'rows' })
  const remote = await listRemote(drive)
  await checkManifest(drive, remote, {})
  const snapshot = emptySnapshot()
  const files: SyncFiles = {}
  let downloaded = 0
  for (const [name, file] of remote) {
    if (!isDataFile(name)) continue
    const rows = decodeJson<Rows>(await drive.download(file.id))
    downloaded++
    files[name] = { id: file.id, version: file.version, hash: hashRows(rows) }
    if (isLogFile(name)) snapshot.log.push(...(rows as ReviewLogEntry[]))
    else Object.assign(snapshot, { [tableKey(name)]: rows })
  }
  const deleted = new Set(snapshot.tombstones.map((t) => t.id))
  snapshot.log = snapshot.log.filter((e) => !deleted.has(e.id))
  await store.replace(snapshot)
  const manifest = remote.get(MANIFEST_FILE)
  if (manifest) files[MANIFEST_FILE] = { id: manifest.id, version: manifest.version, hash: '' }
  const localChanges = snapshot.cards.length + snapshot.states.length + snapshot.log.length
  return { files, downloaded, uploaded: 0, localChanges, pictures: await withPictures(drive, store, remote, options) }
}

/**
 * First sync, "use this device": the Drive copy becomes this device's data, and other devices
 * follow on their next sync. What only Drive has is retired: cards and known words are marked
 * deleted, progress is reset to new, and review answers are undone (tombstones). Where Drive's
 * version of a row differs, this device's is stamped newer. Import records and tombstones from
 * both are kept. Pictures no card here uses are removed from Drive (devices keep their own).
 */
export async function replaceRemoteFromLocal(drive: DriveLike, store: LocalStore, options: SyncOptions & { now?: number } = {}): Promise<SyncOutcome> {
  const now = options.now ?? Date.now()
  options.onProgress?.({ step: 'rows' })
  const remote = await listRemote(drive)
  await checkManifest(drive, remote, {})
  const local = await store.read()
  const theirs = emptySnapshot()
  const theirHashes = new Map<string, string>()
  let downloaded = 0
  for (const [name, file] of remote) {
    if (!isDataFile(name)) continue
    const rows = decodeJson<Rows>(await drive.download(file.id))
    downloaded++
    theirHashes.set(name, hashRows(rows))
    if (isLogFile(name)) theirs.log.push(...(rows as ReviewLogEntry[]))
    else Object.assign(theirs, { [tableKey(name)]: rows })
  }

  const newer = (row: { updatedAt: number }) => Math.max(now, row.updatedAt + 1)
  const cards = preferLocal(local.cards, theirs.cards, (c) => (c.deletedAt === undefined ? { ...c, deletedAt: now, updatedAt: newer(c) } : c))
  const known = preferLocal(local.known, theirs.known, (w) => (w.deletedAt === undefined ? { ...w, deletedAt: now, updatedAt: newer(w) } : w))
  const states = preferLocal(local.states, theirs.states, (s) =>
    s.box === 0 && s.reviewCount === 0 ? s : { ...s, box: 0, dueOn: null, introducedOn: null, lastReviewedAt: null, reviewCount: 0, lapseCount: 0, updatedAt: newer(s) },
  )
  const settings = preferLocal(local.settings, theirs.settings, (s) => s)
  const imports = mergeVersioned(local.imports, theirs.imports)
  const answered = new Set(local.log.map((e) => e.id))
  const undone = theirs.log.filter((e) => !answered.has(e.id)).map((e): Tombstone => ({ id: e.id, deletedAt: now }))
  const tombstones = mergeTombstones(local.tombstones, [...theirs.tombstones, ...undone])
  const deleted = new Set(tombstones.merged.map((t) => t.id))

  const changes: LocalChanges = {
    cards: cards.localUpdates,
    states: states.localUpdates,
    imports: imports.localUpdates,
    settings: settings.localUpdates,
    tombstones: tombstones.localUpdates,
    known: known.localUpdates,
    logAdds: [],
    logDeletes: local.log.filter((e) => deleted.has(e.id)).map((e) => e.id),
  }
  const localChanges = changeCount(changes)
  if (localChanges > 0) await store.apply(changes)

  // Every Drive data file now holds exactly what this device has (emptied ones included).
  const mine = localFiles({
    cards: cards.merged,
    states: states.merged,
    imports: imports.merged,
    settings: settings.merged,
    tombstones: tombstones.merged,
    known: known.merged,
    log: local.log.filter((e) => !deleted.has(e.id)),
  })
  const files: SyncFiles = {}
  let uploaded = 0
  for (const name of new Set([...mine.keys(), ...[...remote.keys()].filter(isDataFile)])) {
    const rows = mine.get(name) ?? []
    const hash = hashRows(rows)
    const file = remote.get(name)
    if (file && theirHashes.get(name) === hash) {
      files[name] = { id: file.id, version: file.version, hash }
      continue
    }
    if (!file && rows.length === 0) continue
    const saved = file ? await drive.update(file.id, encodeJson(rows)) : await drive.create(name, encodeJson(rows))
    files[name] = { id: saved.id, version: saved.version, hash }
    uploaded++
  }
  const manifest = remote.get(MANIFEST_FILE) ?? (await drive.create(MANIFEST_FILE, encodeJson({ format: SYNC_FORMAT, version: SYNC_VERSION })))
  files[MANIFEST_FILE] = { id: manifest.id, version: manifest.version, hash: '' }

  return { files, downloaded, uploaded, localChanges, pictures: await withPictures(drive, store, remote, options) }
}
