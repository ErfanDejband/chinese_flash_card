import { useState } from 'react'
import { updateDraft, type DraftPatch } from '@/data/repositories/imports'
import type { ImportDraftRecord } from '@/data/db'
import { suggestPinyin } from '@/domain/pinyin/suggest'
import { normalizePinyin } from '@/domain/pinyin/tones'
import { loadSimplifiedDetector, loadToTraditional } from '@/import/extract/traditional'
import type { DraftFlag } from '@/import/types'
import { useBlobUrl } from '@/hooks/useBrowser'
import { cn } from '@/ui/cn'
import { Icon } from '@/ui/icons'
import { FLAG_INFO, liveFlags, TONE_CLASS } from './flags'

const field = 'w-full rounded-lg border border-line bg-paper px-2.5 outline-none focus:border-accent'

export function DraftCard({ draft, onEditImage }: { draft: ImportDraftRecord; onEditImage(): void }) {
  // Local copies so typing doesn't round-trip through IndexedDB; saved on blur.
  const [hanzi, setHanzi] = useState(draft.hanzi)
  const [pinyin, setPinyin] = useState(draft.pinyin)
  const [meaning, setMeaning] = useState(draft.meaning)
  const [notes, setNotes] = useState(draft.notes)
  // The crop only changes together with its box, so the box identifies the image.
  const cropUrl = useBlobUrl(draft.crop?.blob, draft.crop ? `${draft.id}:${draft.imageBox?.join(',')}` : undefined)

  const save = (patch: DraftPatch) => void updateDraft(draft.id, patch)
  const flags = liveFlags(draft.flags, hanzi, pinyin)
  const canSelect = hanzi.trim().length > 0

  /** Save characters and refresh the stored Simplified flag (the pinyin checks are recomputed live). */
  async function saveHanzi(value: string) {
    const next = value.trim()
    const isSimplified = await loadSimplifiedDetector()
    const flags: DraftFlag[] = draft.flags.filter((f) => f !== 'maybe-simplified')
    if (next && isSimplified(next)) flags.push('maybe-simplified')
    save({ hanzi: next, flags, selected: draft.selected && next.length > 0 })
  }

  async function toTraditional() {
    const convert = await loadToTraditional()
    const next = convert(hanzi)
    setHanzi(next)
    await saveHanzi(next)
  }

  return (
    <li className={cn('rounded-2xl border bg-surface p-3 transition', draft.selected ? 'border-line' : 'border-dashed border-line opacity-60')}>
      <div className="flex gap-3">
        <label className="flex items-start pt-1">
          <input
            type="checkbox"
            className="size-5 accent-(--color-accent)"
            checked={draft.selected && canSelect}
            disabled={!canSelect}
            onChange={(e) => save({ selected: e.target.checked })}
            aria-label={`Import ${hanzi || 'this card'}`}
          />
        </label>

        <button
          type="button"
          onClick={onEditImage}
          className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white text-muted sm:size-28"
          aria-label={draft.crop ? 'Adjust picture' : 'Pick a picture from the page'}
        >
          {cropUrl ? <img src={cropUrl} alt="" className="size-full object-contain" /> : <Icon name="image" className="size-7" />}
          <span className="absolute right-1 bottom-1 rounded-md bg-black/55 px-1.5 text-[10px] font-semibold text-white">edit</span>
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            lang="zh-Hant"
            className={cn(field, 'h-11 text-2xl')}
            value={hanzi}
            onChange={(e) => setHanzi(e.target.value)}
            onBlur={() => void saveHanzi(hanzi)}
            placeholder="Characters"
            aria-label="Characters"
          />
          <div className="flex gap-2">
            <input
              className={cn(field, 'h-10 min-w-0 flex-1')}
              value={pinyin}
              onChange={(e) => setPinyin(e.target.value)}
              onBlur={() => {
                const next = normalizePinyin(pinyin)
                setPinyin(next)
                save({ pinyin: next })
              }}
              placeholder="Pinyin"
              aria-label="Pinyin"
              autoCapitalize="none"
              spellCheck={false}
            />
            <input
              className={cn(field, 'h-10 min-w-0 flex-1')}
              value={meaning}
              onChange={(e) => setMeaning(e.target.value)}
              onBlur={() => save({ meaning: meaning.trim() })}
              placeholder="Meaning"
              aria-label="Meaning"
            />
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => save({ kind: draft.kind === 'word' ? 'sentence' : 'word' })}
          className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-muted"
          title="Toggle word / sentence"
        >
          {draft.kind === 'word' ? 'Word' : 'Sentence'}
        </button>
        {flags.map((f) => (
          <span key={f} className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', TONE_CLASS[FLAG_INFO[f].tone])}>
            {FLAG_INFO[f].label}
          </span>
        ))}
        {flags.includes('maybe-simplified') && (
          <button type="button" className="text-xs font-semibold text-accent underline" onClick={() => void toTraditional()}>
            convert to Traditional
          </button>
        )}
        {flags.includes('pinyin-mismatch') && hanzi && (
          <button
            type="button"
            className="text-xs font-semibold text-accent underline"
            onClick={() => {
              const next = suggestPinyin(hanzi)
              setPinyin(next)
              save({ pinyin: next })
            }}
          >
            use dictionary pinyin
          </button>
        )}
      </div>

      <textarea
        className={cn(field, 'mt-2 min-h-9 py-1.5 text-sm')}
        rows={notes ? 2 : 1}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => save({ notes: notes.trim() })}
        placeholder="Notes"
        aria-label="Notes"
      />
    </li>
  )
}
