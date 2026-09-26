import { containsHan } from '@/domain/cjk'
import { checkPinyin } from '@/domain/pinyin/suggest'
import { normalizePinyin } from '@/domain/pinyin/tones'
import type { DraftFields, DraftFlag, ExtractedItem } from '../types'

export const LOW_CONFIDENCE = 0.6

export interface PostprocessContext {
  /** Characters of cards already in the deck. */
  existingHanzi: ReadonlySet<string>
  /** Characters already drafted in this import; updated as items are processed. */
  seenInImport: Set<string>
  /** True when the text contains Simplified-only characters. */
  isSimplified?: (text: string) => boolean
}

function notesFor(item: ExtractedItem): string {
  return [item.partOfSpeech, item.notes].filter(Boolean).join(' · ')
}

/** Turn validated model items into draft card fields with review flags. Pure. */
export function postprocess(items: ExtractedItem[], ctx: PostprocessContext): DraftFields[] {
  return items.map((item) => {
    const hanzi = item.hanzi.replace(/\s+/g, item.kind === 'sentence' ? ' ' : '').trim()
    const pinyin = normalizePinyin(item.pinyin)
    const flags: DraftFlag[] = []

    if (item.hanziSource === 'inferred') flags.push('hanzi-inferred')
    if (item.pinyinSource === 'inferred') flags.push('pinyin-inferred')
    if (item.meaningSource === 'inferred') flags.push('meaning-inferred')

    if (!containsHan(hanzi)) {
      flags.push('no-han')
    } else {
      const check = checkPinyin(hanzi, pinyin)
      if (check === 'mismatch') flags.push('pinyin-mismatch')
      else if (check === 'tone-differs') flags.push('tone-differs')
      if (ctx.isSimplified?.(hanzi)) flags.push('maybe-simplified')
    }

    if (ctx.existingHanzi.has(hanzi)) flags.push('duplicate-existing')
    else if (ctx.seenInImport.has(hanzi)) flags.push('duplicate-import')
    if (hanzi) ctx.seenInImport.add(hanzi)

    if (item.confidence < LOW_CONFIDENCE) flags.push('low-confidence')

    const selected = !flags.some((f) => f === 'no-han' || f === 'duplicate-existing' || f === 'duplicate-import')
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
      selected,
    }
  })
}
