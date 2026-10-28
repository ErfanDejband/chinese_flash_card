import type { Card } from '@/domain/types'

export const EXPORT_COLUMNS = ['Hanzi', 'Pinyin', 'Meaning', 'Notes', 'Example', 'Example pinyin', 'Example meaning', 'Tags'] as const

type ExportedCard = Pick<Card, 'hanzi' | 'pinyin' | 'meaning' | 'notes' | 'example' | 'tags'> & Partial<Pick<Card, 'createdAt'>>

/** CSV-style quoting for fields with a tab, line break or quote (Anki reads it; plain fields stay bare for Pleco). */
const field = (text: string) => (/[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)

/**
 * Cards as an Anki "Notes in Plain Text" file: tab-separated, with the header lines Anki reads
 * (`#separator`, `#html`, `#columns`, `#tags column`). Characters, pinyin and meaning come first,
 * the order Pleco imports. Oldest cards first; spaces inside a tag become `_` (Anki splits tags on spaces).
 */
export function wordListTsv(cards: readonly ExportedCard[]): string {
  const sorted = [...cards].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  const lines = ['#separator:tab', '#html:false', `#columns:${EXPORT_COLUMNS.join('\t')}`, `#tags column:${EXPORT_COLUMNS.length}`]
  for (const c of sorted) {
    const tags = c.tags.map((t) => t.trim().replace(/\s+/g, '_')).filter(Boolean)
    const fields = [c.hanzi, c.pinyin, c.meaning ?? '', c.notes ?? '', c.example?.hanzi ?? '', c.example?.pinyin ?? '', c.example?.meaning ?? '', tags.join(' ')]
    lines.push(fields.map(field).join('\t'))
  }
  return `${lines.join('\n')}\n`
}
