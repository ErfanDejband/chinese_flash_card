import { useState, type FormEvent, type ReactNode } from 'react'
import { createCard, updateCard, validateCardDraft, type CardDraft } from '@/data/repositories/cards'
import { checkPinyin, suggestPinyin } from '@/domain/pinyin/suggest'
import { normalizePinyin } from '@/domain/pinyin/tones'
import type { Card } from '@/domain/types'
import { Button } from '@/ui/Button'
import { Icon } from '@/ui/icons'
import { ImagePicker, type ImageChange } from './ImagePicker'

interface Props {
  card?: Card
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

export function CardForm({ card, onSaved }: Props) {
  const [hanzi, setHanzi] = useState(card?.hanzi ?? '')
  const [pinyin, setPinyin] = useState(card?.pinyin ?? '')
  const [meaning, setMeaning] = useState(card?.meaning ?? '')
  const [notes, setNotes] = useState(card?.notes ?? '')
  const [image, setImage] = useState<ImageChange>({ kind: 'keep' })
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const dictionary = hanzi.trim() ? suggestPinyin(hanzi) : ''
  const check = hanzi.trim() && pinyin.trim() ? checkPinyin(hanzi, pinyin) : 'unknown'

  function fillPinyinIfEmpty() {
    if (!pinyin.trim() && dictionary) setPinyin(dictionary)
  }

  async function save(addAnother: boolean) {
    const draft: CardDraft = { hanzi, pinyin, meaning, notes, tags: card?.tags }
    const errors = validateCardDraft(draft)
    if (errors.length) {
      setError(errors[0])
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      const imageArg = image.kind === 'keep' ? undefined : image.kind === 'set' ? image.media : null
      const saved = card
        ? await updateCard(card.id, draft, imageArg)
        : await createCard({ ...draft, image: imageArg ?? undefined })
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
          placeholder="老師"
          className={`${inputClass} h-16 text-3xl`}
        />
      </Field>

      <Field
        label="Pinyin"
        htmlFor="pinyin"
        hint={
          (check === 'mismatch' || check === 'tone-differs') && (
            <p className="mt-1.5 text-sm text-amber-700 dark:text-amber-400">
              Dictionary reading: <span className="font-semibold">{dictionary}</span>{' '}
              <button type="button" className="underline" onClick={() => setPinyin(dictionary)}>
                use it
              </button>
            </p>
          )
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
          placeholder="teacher"
          className={`${inputClass} h-12`}
        />
      </Field>

      <div>
        <span className="mb-1.5 block text-sm font-semibold">Image</span>
        <ImagePicker currentImageId={card?.imageId} value={image} onChange={setImage} />
      </div>

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
