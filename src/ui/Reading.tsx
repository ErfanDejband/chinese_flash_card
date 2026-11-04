import { toZhuyin } from '@/domain/pinyin/zhuyin'
import { symbolInfo } from '@/domain/zhuyinSymbols'
import { useReadingPref } from '@/hooks/useBrowser'
import type { ReadingPref } from '@/lib/readingPref'

interface Props {
  pinyin: string
  /** The same text in characters: tells apart words that can split two ways. */
  hanzi?: string
  /** Overrides the device's choice. */
  show?: ReadingPref
  className?: string
}

/** How a word is read, the way this device shows it. Text that can't be converted stays pinyin. */
export function Reading({ pinyin, hanzi, show, className }: Props) {
  const pref = useReadingPref()
  const mode = show ?? pref
  const zhuyin = mode === 'pinyin' ? null : toZhuyin(pinyin, hanzi)
  if (!zhuyin) return <span className={className}>{pinyin}</span>
  return (
    <span className={className}>
      {mode === 'both' && `${pinyin} · `}
      <span lang="zh-Hant">{zhuyin}</span>
    </span>
  )
}

/** Under a pinyin field: the zhuyin it turns into, so a wrong split can be fixed with an apostrophe. */
export function ZhuyinPreview({ pinyin, hanzi }: { pinyin: string; hanzi: string }) {
  const pref = useReadingPref()
  if (pref === 'pinyin' || !pinyin.trim() || symbolInfo(hanzi.trim())) return null
  const zhuyin = toZhuyin(pinyin, hanzi)
  if (!zhuyin) return <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">No zhuyin for this pinyin: check the spelling.</p>
  return (
    <p lang="zh-Hant" className="mt-1 text-sm text-muted">
      {zhuyin}
    </p>
  )
}
