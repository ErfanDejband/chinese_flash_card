import { canonicalJson } from '@/domain/sync/merge'
import type { Card, Deck, Id, Lesson, Timestamp } from '@/domain/types'
import type { ClassBody, ClassCard, ClassLessonInfo, ClassManifest } from './format'

/** A lesson of the class, fetched. */
export interface FetchedLesson {
  info: ClassLessonInfo
  cards: ClassCard[]
}

/** This device's rows for the class: its deck, lessons, and every card row (deleted ones too) of the deck or with a fetched id. */
export interface LocalClass {
  deck?: Deck
  lessons: Lesson[]
  cards: Card[]
}

export interface ClassPlan {
  deck: Deck
  /** Lesson and card rows to write (new, changed, or soft-deleted). */
  lessons: Lesson[]
  cards: Card[]
  /** Cards new on this device (they need a review state). */
  added: Id[]
  /** Pictures the written cards use. */
  pictures: Id[]
}

const sameCard = (a: Card, b: Card) => canonicalJson(a) === canonicalJson(b)

/**
 * The rows that bring this device's copy of a class up to date (pure; the data layer writes them).
 * - The deck keeps the teacher's deck id; its `remote` records the lessons taken with the version applied.
 * - Cards keep the teacher's ids and timestamps, so a student's devices write identical rows.
 * - A card the student removed stays removed; an id already used in another deck is left alone.
 * - In each fetched lesson, cards the teacher removed are removed; lessons gone from the class go with their cards.
 */
export function planClass(opts: {
  manifest: ClassManifest
  body: ClassBody
  manifestId: string
  key?: string
  local: LocalClass
  fetched: readonly FetchedLesson[]
  /** The lessons the student has after this: those taken before and still in the class, plus new picks. */
  taken: readonly Id[]
  /** Lessons the student has been shown (new ones are pointed out); default: every lesson of the class. */
  seen?: readonly Id[]
  /** List position for a new deck. */
  order: number
  now: Timestamp
}): ClassPlan {
  const { manifest, body, local, now } = opts
  const deckId = manifest.id
  const inClass = new Map(body.lessons.map((l) => [l.id, l]))
  const taken = opts.taken.filter((id) => inClass.has(id))
  const fetched = new Map(opts.fetched.map((f) => [f.info.id, f]))

  const before = local.deck?.remote?.lessons ?? {}
  const deck: Deck = {
    ...(local.deck ?? { id: deckId, order: opts.order, createdAt: now }),
    id: deckId,
    title: manifest.title,
    ...(manifest.teacher ? { teacher: manifest.teacher } : {}),
    ...(body.description ? { description: body.description } : {}),
    remote: {
      manifestId: opts.manifestId,
      ...(opts.key ? { key: opts.key } : {}),
      lessons: Object.fromEntries(taken.map((id) => [id, fetched.get(id)?.info.hash ?? before[id] ?? ''])),
      seen: (opts.seen ?? body.lessons.map((l) => l.id)).filter((id) => inClass.has(id)),
    },
    updatedAt: now,
  }
  if (!manifest.teacher) delete deck.teacher
  if (!body.description) delete deck.description
  delete deck.deletedAt

  // Lessons: the ones taken, with the teacher's titles and order; the rest of this deck's go.
  const localLessons = new Map(local.lessons.map((l) => [l.id, l]))
  const lessons: Lesson[] = []
  for (const id of taken) {
    const info = inClass.get(id)!
    const old = localLessons.get(id)
    if (old && old.deletedAt === undefined && old.title === info.title && old.order === info.order) continue
    lessons.push({ id, deckId, title: info.title, order: info.order, createdAt: old?.createdAt ?? now, updatedAt: now })
  }
  for (const l of local.lessons) if (l.deckId === deckId && l.deletedAt === undefined && !taken.includes(l.id)) lessons.push({ ...l, deletedAt: now, updatedAt: now })

  const byId = new Map(local.cards.map((c) => [c.id, c]))
  const cards: Card[] = []
  const added: Id[] = []
  const pictures = new Set<Id>()
  const kept = new Set<Id>()
  for (const f of opts.fetched) {
    if (!taken.includes(f.info.id)) continue
    for (const c of f.cards) {
      const old = byId.get(c.id)
      if (old && old.deckId !== deckId) continue
      kept.add(c.id)
      if (old?.deletedAt !== undefined) continue
      const imageId = c.imageId && body.pictures[c.imageId] ? c.imageId : undefined
      const row: Card = {
        id: c.id,
        hanzi: c.hanzi,
        pinyin: c.pinyin,
        ...(c.meaning ? { meaning: c.meaning } : {}),
        ...(c.notes ? { notes: c.notes } : {}),
        ...(c.example ? { example: c.example } : {}),
        ...(imageId ? { imageId } : {}),
        tags: c.tags,
        deckId,
        lessonId: f.info.id,
        source: { type: 'manual' },
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }
      if (imageId) pictures.add(imageId)
      if (old && sameCard(old, row)) continue
      cards.push(row)
      if (!old) added.push(c.id)
    }
  }
  // Removed by the teacher: cards of a fetched lesson that aren't in it any more, and cards of lessons gone or dropped.
  for (const c of local.cards) {
    if (c.deckId !== deckId || c.deletedAt !== undefined || kept.has(c.id)) continue
    const lesson = c.lessonId ?? ''
    if ((fetched.has(lesson) && taken.includes(lesson)) || !taken.includes(lesson)) cards.push({ ...c, deletedAt: now, updatedAt: now })
  }

  return { deck, lessons, cards, added, pictures: [...pictures] }
}
