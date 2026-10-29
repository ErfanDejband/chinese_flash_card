import { defaultChoice, type LearnerLevel, type ObjectWords, type WordChoice } from './tasks'

/** Why a word can't be kept: it is already a card, or the learner marked it as known. */
export type Taken = 'in-deck' | 'known'

export interface SnapContext {
  inDeck: ReadonlySet<string>
  known: ReadonlySet<string>
}

export function takenReason(word: Pick<WordChoice, 'hanzi'>, ctx: SnapContext): Taken | undefined {
  if (ctx.inDeck.has(word.hanzi)) return 'in-deck'
  if (ctx.known.has(word.hanzi)) return 'known'
  return undefined
}

/**
 * The word preselected for one object: the learner's default (vision/tasks `defaultChoice`), or
 * else the first word that is still free; none when every word is already a card or known.
 */
export function preselect(words: readonly WordChoice[], learner: LearnerLevel, ctx: SnapContext): number[] {
  if (!words.length) return []
  const preferred = defaultChoice(words, learner)
  if (!takenReason(words[preferred]!, ctx)) return [preferred]
  const free = words.findIndex((w) => !takenReason(w, ctx))
  return free >= 0 ? [free] : []
}

/** Preselected words for every named object, by picture number. */
export function preselectAll(names: ReadonlyMap<number, ObjectWords>, learner: LearnerLevel, ctx: SnapContext): Record<number, number[]> {
  return Object.fromEntries([...names].map(([index, n]) => [index, preselect(n.words, learner, ctx)]))
}

/** A card from Snap is tagged `snap` and with its category in Chinese (衣物), to find it later. */
export function snapTags(category?: { hanzi: string }): string[] {
  return category?.hanzi ? ['snap', category.hanzi] : ['snap']
}

export interface PlannedCard {
  /** 1-based picture number: whose crop becomes the card's picture. */
  index: number
  word: WordChoice
  tags: string[]
}

/**
 * The cards to make, in picture order: every kept word that is not a card or known yet, once
 * (two objects named 遙控器 make one card).
 */
export function plannedCards(names: ReadonlyMap<number, ObjectWords>, picks: Readonly<Record<number, readonly number[]>>, count: number, ctx: SnapContext): PlannedCard[] {
  const seen = new Set<string>()
  const out: PlannedCard[] = []
  for (let index = 1; index <= count; index++) {
    const n = names.get(index)
    if (!n) continue
    for (const k of picks[index] ?? []) {
      const word = n.words[k]
      if (!word || takenReason(word, ctx) || seen.has(word.hanzi)) continue
      seen.add(word.hanzi)
      out.push({ index, word, tags: snapTags(n.category) })
    }
  }
  return out
}
