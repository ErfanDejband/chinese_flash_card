import { containsHan } from '@/domain/cjk'
import { checkPinyin } from '@/domain/pinyin/suggest'
import { normalizePinyin } from '@/domain/pinyin/tones'
import { UNSELECTED_FLAGS, type DraftFields, type DraftFlag, type ExtractedItem } from '../types'

export const LOW_CONFIDENCE = 0.6

export interface PostprocessContext {
  /** Characters of cards already in the deck. */
  existingHanzi: ReadonlySet<string>
  /** Characters already drafted in this import; updated as items are processed. */
  seenInImport: Set<string>
  /** Words in the learner's known-words list. */
  knownHanzi?: ReadonlySet<string>
  /** True when the text contains Simplified-only characters. */
  isSimplified?: (text: string) => boolean
}

function notesFor(item: ExtractedItem): string {
  return [item.partOfSpeech, item.notes].filter(Boolean).join(' · ')
}

/** Checks of the characters themselves: Chinese at all, pinyin matching, Simplified, low confidence. */
export function contentFlags(hanzi: string, pinyin: string, confidence: number, ctx: PostprocessContext): DraftFlag[] {
  const flags: DraftFlag[] = []
  if (!containsHan(hanzi)) {
    flags.push('no-han')
  } else {
    const check = checkPinyin(hanzi, pinyin)
    if (check === 'mismatch') flags.push('pinyin-mismatch')
    else if (check === 'tone-differs') flags.push('tone-differs')
    if (ctx.isSimplified?.(hanzi)) flags.push('maybe-simplified')
  }
  if (confidence < LOW_CONFIDENCE) flags.push('low-confidence')
  return flags
}

/** Duplicates, names and known words start unselected. */
export const startsSelected = (flags: DraftFlag[]) => !flags.some((f) => UNSELECTED_FLAGS.has(f))

/** Turn validated model items into draft card fields with review flags. Pure. */
export function postprocess(items: ExtractedItem[], ctx: PostprocessContext): DraftFields[] {
  return items.map((item) => {
    const hanzi = item.hanzi.replace(/\s+/g, item.kind === 'sentence' ? ' ' : '').trim()
    const pinyin = normalizePinyin(item.pinyin)
    const flags: DraftFlag[] = []

    if (item.hanziSource === 'inferred') flags.push('hanzi-inferred')
    if (item.pinyinSource === 'inferred') flags.push('pinyin-inferred')
    if (item.meaningSource === 'inferred') flags.push('meaning-inferred')
    flags.push(...contentFlags(hanzi, pinyin, item.confidence, ctx))

    if (ctx.existingHanzi.has(hanzi)) flags.push('duplicate-existing')
    else if (ctx.seenInImport.has(hanzi)) flags.push('duplicate-import')
    else if (ctx.knownHanzi?.has(hanzi)) flags.push('known')
    if (hanzi) ctx.seenInImport.add(hanzi)

    return {
      kind: item.kind,
      hanzi,
      pinyin,
      meaning: item.meaning,
      notes: notesFor(item),
      imageBox: item.imageBox,
      hanziSource: item.hanziSource,
      pinyinSource: item.pinyinSource,
      meaningSource: item.meaningSource,
      confidence: item.confidence,
      flags,
      selected: startsSelected(flags),
    }
  })
}
