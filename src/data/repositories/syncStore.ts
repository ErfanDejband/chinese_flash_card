import type { LocalChanges, LocalSnapshot, LocalStore, SyncedSettings } from '@/sync/types'
import { db as defaultDb, type AppDB, type SettingsRecord } from '../db'

function withoutVoice({ ttsVoiceURI: _voice, ...rest }: SettingsRecord): SyncedSettings {
  return rest
}

/** Incoming settings keep this device's speech voice. */
function withLocalVoice(s: SyncedSettings, local: SettingsRecord | undefined): SettingsRecord {
  return local?.ttsVoiceURI ? { ...s, ttsVoiceURI: local.ttsVoiceURI } : s
}

/**
 * The synced part of one device's database. Not synced: media (step 2), import work tables,
 * and imports still in draft (their pages exist only on the device that started them).
 */
export function createSyncStore(database: AppDB = defaultDb): LocalStore {
  const tables = () => [database.cards, database.reviewStates, database.imports, database.settings, database.syncTombstones, database.reviewLog]

  return {
    async read(): Promise<LocalSnapshot> {
      const [cards, states, imports, settings, tombstones, log] = await Promise.all([
        database.cards.toArray(),
        database.reviewStates.toArray(),
        database.imports.toArray(),
        database.settings.toArray(),
        database.syncTombstones.toArray(),
        database.reviewLog.toArray(),
      ])
      return { cards, states, imports: imports.filter((i) => i.status !== 'draft'), settings: settings.map(withoutVoice), tombstones, log }
    },

    async apply(c: LocalChanges): Promise<void> {
      await database.transaction('rw', tables(), async () => {
        await database.cards.bulkPut(c.cards)
        await database.reviewStates.bulkPut(c.states)
        await database.imports.bulkPut(c.imports)
        await database.syncTombstones.bulkPut(c.tombstones)
        await database.reviewLog.bulkPut(c.logAdds)
        await database.reviewLog.bulkDelete(c.logDeletes)
        for (const s of c.settings) await database.settings.put(withLocalVoice(s, await database.settings.get(s.id)))
      })
    },

    async replace(snapshot: LocalSnapshot): Promise<void> {
      await database.transaction('rw', tables(), async () => {
        const localSettings = await database.settings.get('app')
        // An import still in progress here keeps its record (its pages live only on this device).
        await database.imports.filter((i) => i.status !== 'draft').delete()
        await Promise.all([database.cards, database.reviewStates, database.settings, database.syncTombstones, database.reviewLog].map((t) => t.clear()))
        await database.cards.bulkPut(snapshot.cards)
        await database.reviewStates.bulkPut(snapshot.states)
        await database.imports.bulkPut(snapshot.imports)
        await database.syncTombstones.bulkPut(snapshot.tombstones)
        await database.reviewLog.bulkPut(snapshot.log)
        await database.settings.bulkPut(snapshot.settings.map((s) => withLocalVoice(s, localSettings)))
      })
    },
  }
}
