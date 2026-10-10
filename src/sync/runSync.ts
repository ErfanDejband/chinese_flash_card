import { mergeLog, mergeTombstones, mergeVersioned, type Tombstone, type Versioned } from '@/domain/sync/merge'
import type { ReviewLogEntry } from '@/domain/types'
import { decodeJson, encodeJson, hashRows, isDataFile, isLogFile, logFileName, logMonth, MANIFEST_FILE, SYNC_FORMAT, SYNC_VERSION, TABLE_FILES, type Manifest } from './snapshot'
import { SyncError, type DriveLike, type LocalChanges, type LocalSnapshot, type LocalStore, type RemoteFile, type SyncFiles } from './types'

export interface SyncOutcome {
  files: SyncFiles
  downloaded: number
  uploaded: number
  /** Rows written on this device. */
  localChanges: number
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

const emptyChanges = (): LocalChanges => ({ cards: [], states: [], imports: [], settings: [], tombstones: [], logAdds: [], logDeletes: [] })

const changeCount = (c: LocalChanges) =>
  c.cards.length + c.states.length + c.imports.length + c.settings.length + c.tombstones.length + c.logAdds.length + c.logDeletes.length

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
export async function runSync(drive: DriveLike, store: LocalStore, previous: SyncFiles): Promise<SyncOutcome> {
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

  return { files, downloaded, uploaded: uploads.length, localChanges }
}

/** First sync, "use the Drive copy": this device's synced data becomes exactly the Drive copy. */
export async function replaceLocalFromRemote(drive: DriveLike, store: LocalStore): Promise<SyncOutcome> {
  const remote = await listRemote(drive)
  await checkManifest(drive, remote, {})
  const snapshot: LocalSnapshot = { cards: [], states: [], imports: [], settings: [], tombstones: [], log: [] }
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
  return { files, downloaded, uploaded: 0, localChanges: snapshot.cards.length + snapshot.states.length + snapshot.log.length }
}
