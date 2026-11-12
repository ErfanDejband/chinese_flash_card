import type { ClassLessonInfo } from '@/classes/format'
import { checkClass, markSeen } from '@/classes/join'
import { createClassStore } from '@/data/repositories/classStore'
import { db } from '@/data/db'
import type { Id } from '@/domain/types'
import { publicRead } from './classConfig'

/**
 * Keeps joined classes up to date: on start, when the app comes back online and when Decks
 * opens, each class not looked at for 6 hours is checked (one small request). Teachers' changes
 * to lessons taken are applied; new lessons are kept here (device-only) until the student adds
 * them or says not now.
 */
const STORAGE_KEY = 'mandarin-leitner.class-checks'
const EVERY_MS = 6 * 60 * 60_000

export interface ClassNews {
  /** When this device last looked at the class. */
  at: number
  newLessons: Pick<ClassLessonInfo, 'id' | 'title' | 'cards'>[]
  /** The student saw the note that the teacher stopped sharing (the stop itself is on the synced deck row). */
  stopSeen?: boolean
}

let cache: Record<Id, ClassNews> | undefined
let running: Promise<void> | undefined
const listeners = new Set<() => void>()

export function getClassNews(): Record<Id, ClassNews> {
  if (!cache) {
    try {
      cache = (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Record<Id, ClassNews> | null) ?? {}
    } catch {
      cache = {}
    }
  }
  return cache
}

function save(next: Record<Id, ClassNews>): void {
  cache = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: lasts for this session only.
  }
  listeners.forEach((l) => l())
}

export function subscribeClassNews(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Look at every joined class due for a check (or all of them with `force`). Never throws. */
export function checkClasses(force = false): Promise<void> {
  running ??= (async () => {
    try {
      const store = createClassStore()
      const decks = await db.decks.filter((d) => d.deletedAt === undefined && !!d.remote?.manifestId && !d.remote.stopped).toArray()
      for (const deck of decks) {
        const last = getClassNews()[deck.id]
        if (!force && last && Date.now() - last.at < EVERY_MS) continue
        try {
          const result = await checkClass(publicRead, store, deck)
          save({ ...getClassNews(), [deck.id]: { ...getClassNews()[deck.id], at: Date.now(), newLessons: result.newLessons.map(({ id, title, cards }) => ({ id, title, cards })) } })
        } catch {
          // Offline or a passing Drive problem: try again next time.
        }
      }
    } finally {
      running = undefined
    }
  })()
  return running
}

/** The student added these lessons or said not now: stop pointing them out. */
export async function dismissNews(deckId: Id, lessonIds: Id[]): Promise<void> {
  await markSeen(createClassStore(), deckId, lessonIds)
  const news = getClassNews()[deckId]
  if (news) save({ ...getClassNews(), [deckId]: { ...news, newLessons: news.newLessons.filter((l) => !lessonIds.includes(l.id)) } })
}

/** The student read the note that the teacher stopped sharing this class (this device only). */
export function dismissStop(deckId: Id): void {
  save({ ...getClassNews(), [deckId]: { at: getClassNews()[deckId]?.at ?? 0, newLessons: [], ...getClassNews()[deckId], stopSeen: true } })
}

/** A class that isn't followed any more (made the student's own deck): forget its news on this device. */
export function forgetClass(deckId: Id): void {
  const { [deckId]: _gone, ...rest } = getClassNews()
  save(rest)
}

let started = false

/** Call once at startup. */
export function initClasses(): void {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('online', () => void checkClasses())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void checkClasses())
  void checkClasses()
}
