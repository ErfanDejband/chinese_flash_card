import { checkPinyin } from '@/domain/pinyin/suggest'
import type { Taken } from '@/vision/cards'
import type { ObjectWords, WordChoice } from '@/vision/tasks'
import { CropThumb } from './CropThumb'
import { SOURCE_TEXT, type Chosen, type Photo } from './photo'

const TAKEN_TEXT: Record<Taken, string> = { 'in-deck': 'in your cards', known: 'you know this' }

interface Props {
  photo: Photo
  chosen: readonly Chosen[]
  names?: ReadonlyMap<number, ObjectWords>
  /** Kept words per picture number (indexes into its words). */
  picks: Readonly<Record<number, readonly number[]>>
  onToggle(index: number, word: number): void
  busy?: boolean
  /** Words that are already a card, or known, can't be kept. */
  taken?: (word: WordChoice) => Taken | undefined
}

/**
 * The AI's words for each chosen object, from the everyday word to more precise ones, as chips
 * to keep: the learner's level preselects one, a second makes a second card with the same picture.
 */
export function WordChoices({ photo, chosen, names, picks, onToggle, busy, taken }: Props) {
  return (
    <ol className="space-y-3 text-sm">
      {chosen.map((c, i) => {
        const n = names?.get(i + 1)
        const kept = picks[i + 1] ?? []
        return (
          <li key={i} className="flex gap-3">
            <div className="relative shrink-0">
              <CropThumb photo={photo.canvas} box={c.box} size={56} />
              <span className="absolute -top-1 -left-1 grid size-5 place-items-center rounded-md bg-accent text-[11px] font-bold text-on-accent">{i + 1}</span>
            </div>
            {n?.words.length ? (
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-1.5">
                  {n.words.map((w, k) => {
                    const on = kept.includes(k)
                    const why = taken?.(w)
                    const pinyinOff = w.pinyin && checkPinyin(w.hanzi, w.pinyin) === 'mismatch'
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onToggle(i + 1, k)}
                        disabled={Boolean(why)}
                        aria-pressed={on}
                        className={`rounded-xl border px-2.5 py-1 text-left disabled:opacity-60 ${on ? 'border-accent bg-accent/10' : 'border-line bg-paper'}`}
                      >
                        <span lang="zh-Hant" className="text-base font-semibold">
                          {w.hanzi}
                        </span>{' '}
                        <span>{w.pinyin}</span>
                        {w.level && <span className="ml-1.5 rounded bg-sunken px-1 text-[10px] font-semibold text-muted">{w.level}</span>}
                        <span className="block text-xs text-muted">
                          {on ? '✓ ' : ''}
                          {w.meaning} · {why ? TAKEN_TEXT[why] : w.kind === 'everyday' ? 'everyday word' : 'more precise'}
                        </span>
                        {pinyinOff && <span className="block text-xs text-amber-700 dark:text-amber-400">check the pinyin</span>}
                      </button>
                    )
                  })}
                </div>
                {n.category && (
                  <p className="mt-1 text-xs text-muted">
                    Tag: <span lang="zh-Hant">{n.category.hanzi}</span> {n.category.pinyin} · {n.category.meaning}
                  </p>
                )}
                {kept.length > 1 && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Two cards. Very similar words learned on the same days can get mixed up; adding the second one later can help.</p>
                )}
              </div>
            ) : (
              <span className="pt-1 text-muted">{busy ? 'Naming…' : n ? 'The AI couldn’t tell what this is. Adjust the box or remove it.' : SOURCE_TEXT[c.source]}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
