import type { ImportDraftRecord } from '@/data/db'
import { updateDraft } from '@/data/repositories/imports'
import type { ReadingSentence } from '@/import/types'
import { cn } from '@/ui/cn'

interface Props {
  sentences: ReadingSentence[]
  /** This import's drafts by characters (a word is drafted once, on the page it first appears). */
  drafts: ReadonlyMap<string, ImportDraftRecord>
  /** Characters of the cards already in the deck. */
  existing: ReadonlySet<string>
}

function WordChip({ text, draft, existing }: { text: string; draft?: ImportDraftRecord; existing: boolean }) {
  if (draft) {
    const known = draft.flags.includes('known')
    return (
      <button
        type="button"
        aria-pressed={draft.selected}
        aria-label={`${text}: ${draft.selected ? 'will be added' : 'left out'}`}
        onClick={() => void updateDraft(draft.id, { selected: !draft.selected })}
        className={cn(
          'rounded-lg border px-1.5 py-0.5 transition',
          draft.selected
            ? 'border-accent bg-accent text-on-accent'
            : cn('bg-surface text-ink', known ? 'border-dashed border-muted' : 'border-line'),
        )}
      >
        {text}
      </button>
    )
  }
  if (existing) {
    return (
      <span className="rounded-lg bg-sunken px-1.5 py-0.5 text-muted" title="Already in your cards">
        {text}
        <span className="ml-0.5 text-xs" aria-label="already a card">
          ✓
        </span>
      </span>
    )
  }
  return <span className="px-0.5">{text}</span>
}

/** A reading page's sentences with every word as a chip: tap a word to add it or leave it out. */
export function SentenceReader({ sentences, drafts, existing }: Props) {
  return (
    <ol className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3">
      {sentences.map((s, i) => (
        <li key={i}>
          <p lang="zh-Hant" className="flex flex-wrap items-center gap-1 text-xl leading-relaxed">
            {s.parts.map((part, j) =>
              part.word ? (
                <WordChip key={j} text={part.text} draft={drafts.get(part.text)} existing={existing.has(part.text)} />
              ) : (
                <span key={j} className="text-muted">
                  {part.text}
                </span>
              ),
            )}
          </p>
          {s.meaning && <p className="mt-1 text-sm text-muted">{s.meaning}</p>}
          {s.mismatch && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">The AI’s words don’t match this sentence exactly: check them.</p>
          )}
        </li>
      ))}
    </ol>
  )
}
