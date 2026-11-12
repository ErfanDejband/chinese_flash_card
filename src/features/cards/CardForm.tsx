import { useState, type FormEvent, type ReactNode } from 'react'
import { createCard, updateCard, validateCardDraft, type CardDraft } from '@/data/repositories/cards'
import { moveCards } from '@/data/repositories/decks'
import { isGrammar, withGrammar } from '@/domain/grammar'
import { checkPinyin, suggestPinyin } from '@/domain/pinyin/suggest'
import { normalizePinyin } from '@/domain/pinyin/tones'
import type { Card } from '@/domain/types'
import { symbolInfo } from '@/domain/zhuyinSymbols'
import { TargetSelect } from '@/features/decks/TargetSelect'
import { liveTarget, MY_CARDS_TARGET, type Target } from '@/features/decks/target'
import { useDecks, useLessons } from '@/hooks/useDecks'
import { Button } from '@/ui/Button'
import { Icon } from '@/ui/icons'
import { ZhuyinPreview } from '@/ui/Reading'
import { ImagePicker, type ImageChange } from './ImagePicker'

interface Props {
  card?: Card
  /** Deck and lesson for a new card (default My cards). */
  target?: Target
  /** A new card's deck or lesson was changed (so "Save & add another" keeps it). */
  onTargetChange?: (target: Target) => void
  onSaved(card: Card, addAnother: boolean): void
}

const inputClass = 'w-full rounded-xl border border-line bg-surface px-3 outline-none focus:border-accent'

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint}
    </div>
  )
}

export function CardForm({ card, target: initialTarget, onTargetChange, onSaved }: Props) {
  const [hanzi, setHanzi] = useState(card?.hanzi ?? '')
  const [pinyin, setPinyin] = useState(card?.pinyin ?? '')
  const [meaning, setMeaning] = useState(card?.meaning ?? '')
  const [notes, setNotes] = useState(card?.notes ?? '')
  const [example, setExample] = useState(card?.example ?? { hanzi: '', pinyin: '', meaning: '' })
  const [grammar, setGrammar] = useState(card ? isGrammar(card) : false)
  const [image, setImage] = useState<ImageChange>({ kind: 'keep' })
  const [chosen, setChosen] = useState<Target>(card ? { deckId: card.deckId, ...(card.lessonId ? { lessonId: card.lessonId } : {}) } : (initialTarget ?? MY_CARDS_TARGET))
  const decks = useDecks()
  const lessons = useLessons()
  const target = decks && lessons ? liveTarget(chosen, decks, lessons) : chosen
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const dictionary = hanzi.trim() && !symbolInfo(hanzi.trim()) ? suggestPinyin(hanzi) : ''
  // A grammar pattern (雖然…但是…) isn't a dictionary word: no reading check.
  const check = dictionary && pinyin.trim() && !grammar ? checkPinyin(hanzi, pinyin) : 'unknown'

  function fillPinyinIfEmpty() {
    if (!pinyin.trim() && dictionary) setPinyin(dictionary)
  }

  async function save(addAnother: boolean) {
    const draft: CardDraft = { hanzi, pinyin, meaning, notes, example, tags: withGrammar(card?.tags ?? [], grammar) }
    const errors = validateCardDraft(draft)
    if (errors.length) {
      setError(errors[0])
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      const imageArg = image.kind === 'keep' ? undefined : image.kind === 'set' ? image.media : null
      let saved = card ? await updateCard(card.id, draft, imageArg) : await createCard({ ...draft, image: imageArg ?? undefined, ...target })
      if (card && (target.deckId !== card.deckId || target.lessonId !== card.lessonId)) {
        await moveCards([card.id], target.deckId, target.lessonId)
        saved = { ...saved, ...target }
      }
      onSaved(saved, addAnother)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the card')
      setSaving(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void save(false)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label="Chinese" htmlFor="hanzi">
        <input
          id="hanzi"
          lang="zh-Hant"
          value={hanzi}
          onChange={(e) => setHanzi(e.target.value)}
          onBlur={fillPinyinIfEmpty}
          autoFocus={!card}
          autoComplete="off"
          placeholder={grammar ? '雖然…但是…' : '老師'}
          className={`${inputClass} h-16 text-3xl`}
        />
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={grammar} onChange={(e) => setGrammar(e.target.checked)} className="size-4 accent-accent" />
          Grammar point <span className="text-muted">(a pattern; never asked by picture)</span>
        </label>
      </Field>

      <Field
        label="Pinyin"
        htmlFor="pinyin"
        hint={
          <>
            <ZhuyinPreview pinyin={pinyin} hanzi={hanzi} />
            {(check === 'mismatch' || check === 'tone-differs') && (
              <p className="mt-1.5 text-sm text-amber-700 dark:text-amber-400">
                Dictionary reading: <span className="font-semibold">{dictionary}</span>{' '}
                <button type="button" className="underline" onClick={() => setPinyin(dictionary)}>
                  use it
                </button>
              </p>
            )}
          </>
        }
      >
        <div className="flex gap-2">
          <input
            id="pinyin"
            value={pinyin}
            onChange={(e) => setPinyin(e.target.value)}
            onBlur={() => setPinyin(normalizePinyin(pinyin))}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="lǎoshī or lao3shi1"
            className={`${inputClass} h-12 text-lg`}
          />
          <Button
            variant="secondary"
            className="shrink-0 px-3"
            onClick={() => setPinyin(dictionary)}
            disabled={!dictionary}
            aria-label="Fill pinyin from the characters"
            title="Fill pinyin from the characters"
          >
            <Icon name="sparkle" className="size-5" />
          </Button>
        </div>
      </Field>

      <Field label="Meaning" htmlFor="meaning">
        <input
          id="meaning"
          value={meaning}
          onChange={(e) => setMeaning(e.target.value)}
          autoComplete="off"
          placeholder={grammar ? 'although…, (still)…' : 'teacher'}
          className={`${inputClass} h-12`}
        />
      </Field>

      <div>
        <span className="mb-1.5 block text-sm font-semibold">Image</span>
        <ImagePicker currentImageId={card?.imageId} value={image} onChange={setImage} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold">Example sentence</legend>
        <input
          id="example"
          lang="zh-Hant"
          value={example.hanzi}
          onChange={(e) => setExample({ ...example, hanzi: e.target.value })}
          onBlur={() => {
            if (!example.pinyin.trim() && example.hanzi.trim()) setExample({ ...example, pinyin: suggestPinyin(example.hanzi) })
          }}
          autoComplete="off"
          placeholder="我的老師很好。"
          aria-label="Example sentence"
          className={`${inputClass} h-12 text-lg`}
        />
        <input
          value={example.pinyin}
          onChange={(e) => setExample({ ...example, pinyin: e.target.value })}
          onBlur={() => setExample({ ...example, pinyin: normalizePinyin(example.pinyin) })}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Wǒ de lǎoshī hěn hǎo."
          aria-label="Example pinyin"
          className={`${inputClass} h-11`}
        />
        <input
          value={example.meaning}
          onChange={(e) => setExample({ ...example, meaning: e.target.value })}
          autoComplete="off"
          placeholder="My teacher is very good."
          aria-label="Example translation"
          className={`${inputClass} h-11`}
        />
      </fieldset>

      {decks && lessons && decks.length > 0 && (
        <Field label="Deck" htmlFor="target">
          <TargetSelect
            id="target"
            value={target}
            onChange={(t) => {
              setChosen(t)
              if (!card) onTargetChange?.(t)
            }}
            decks={decks}
            lessons={lessons}
            label="Deck and lesson"
            className="w-full"
          />
        </Field>
      )}

      <Field label="Notes" htmlFor="notes">
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Example sentence, measure word, mnemonic…"
          className={`${inputClass} py-2`}
        />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" size="lg" className="flex-1" disabled={saving}>
          {card ? 'Save changes' : 'Save card'}
        </Button>
        {!card && (
          <Button variant="secondary" size="lg" className="flex-1" disabled={saving} onClick={() => void save(true)}>
            Save & add another
          </Button>
        )}
      </div>
    </form>
  )
}
