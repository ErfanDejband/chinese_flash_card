import type { KnownWord } from '@/domain/types'
import { db } from '../db'

/** Add words to the known-words list (again, if they were removed). */
export async function addKnownWords(words: string[], now = Date.now()): Promise<void> {
  const ids = [...new Set(words.map((w) => w.trim()).filter(Boolean))]
  if (!ids.length) return
  await db.transaction('rw', db.knownWords, async () => {
    const existing = await db.knownWords.bulkGet(ids)
    const rows: KnownWord[] = []
    ids.forEach((id, i) => {
      const row = existing[i]
      if (row && row.deletedAt === undefined) return
      rows.push({ id, addedAt: now, updatedAt: now })
    })
    await db.knownWords.bulkPut(rows)
  })
}

/** Soft delete, so sync removes the word on other devices too. */
export async function removeKnownWord(word: string, now = Date.now()): Promise<void> {
  await db.knownWords.update(word, { deletedAt: now, updatedAt: now })
}

/** Known words, most recently added first. */
export async function listKnownWords(): Promise<KnownWord[]> {
  const rows = await db.knownWords.filter((w) => w.deletedAt === undefined).toArray()
  return rows.sort((a, b) => b.addedAt - a.addedAt || (a.id < b.id ? -1 : 1))
}

export async function knownHanziSet(): Promise<Set<string>> {
  return new Set((await listKnownWords()).map((w) => w.id))
}
