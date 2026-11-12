import type { Card } from './types'

/**
 * Grammar cards are ordinary cards with this tag: the pattern (雖然…但是…) as the characters, the
 * explanation as the meaning, and usually an example. They are never asked by picture.
 */
export const GRAMMAR_TAG = 'grammar'

export const isGrammar = (card: Pick<Card, 'tags'>) => card.tags.includes(GRAMMAR_TAG)

/** The tags with the grammar tag switched on or off. */
export function withGrammar(tags: readonly string[], on: boolean): string[] {
  const rest = tags.filter((t) => t !== GRAMMAR_TAG)
  return on ? [...rest, GRAMMAR_TAG] : rest
}
