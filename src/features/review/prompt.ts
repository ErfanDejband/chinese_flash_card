import { isGrammar } from '@/domain/grammar'
import type { Card, ReviewMode } from '@/domain/types'
import { symbolInfo } from '@/domain/zhuyinSymbols'

/**
 * What the card shows before the answer. Picture → Chinese: the picture, else the meaning, else
 * the characters (also when the picture isn't on this device yet, e.g. still syncing).
 * Chinese → meaning: always the characters. Sound → Chinese: the word is spoken once when the
 * card appears (again with the play button, or R in the review page); a device without
 * text-to-speech shows the reading instead. A zhuyin symbol card always asks with the symbol; a
 * grammar card is never asked by picture.
 */
export type PromptKind = 'image' | 'meaning' | 'hanzi' | 'sound'

export function promptKind(card: Card, mode: ReviewMode, pictureHere: boolean): PromptKind {
  if (mode === 'listening') return 'sound'
  if (mode === 'hanzi_to_meaning' || symbolInfo(card.hanzi)) return 'hanzi'
  if (card.imageId && pictureHere && !isGrammar(card)) return 'image'
  if (card.meaning) return 'meaning'
  return 'hanzi'
}
