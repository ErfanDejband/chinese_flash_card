import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { saveSettings } from '@/data/repositories/settings'
import { REVIEW_MODES } from '@/domain/leitner/config'
import { SAMPLE_WORDS } from '@/domain/sampleDeck'
import type { AppSettings, ReviewMode } from '@/domain/types'
import { updateOnboarding } from '@/lib/onboarding'
import { cn } from '@/ui/cn'
import { Hanzi } from '@/ui/Hanzi'
import { Icon } from '@/ui/icons'
import { reviewModeInfo } from '@/ui/reviewModes'
import { LeitnerDemo } from './LeitnerDemo'
import { addSampleDeck } from './sampleDeck'

const CHOICE = 'flex w-full items-center gap-4 rounded-2xl border border-line bg-surface p-4 text-left shadow-sm hover:bg-sunken disabled:opacity-60'

function ChoiceBody({ emoji, title, note }: { emoji: string; title: string; note: ReactNode }) {
  return (
    <>
      <span className="text-3xl" aria-hidden="true">
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{note}</span>
      </span>
      <Icon name="chevron" className="size-5 shrink-0 text-muted" />
    </>
  )
}

/** Home while the deck is empty: how the boxes work, three ways to start, and the practice direction. */
export function Welcome({ settings }: { settings: AppSettings }) {
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string>()

  async function trySample() {
    setAdding(true)
    setError(undefined)
    try {
      await addSampleDeck()
      navigate('/review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the sample cards.')
      setAdding(false)
    }
  }

  async function chooseDirection(reviewMode: ReviewMode) {
    const { updatedAt: _updatedAt, ...rest } = settings
    await saveSettings({ ...rest, reviewMode })
    updateOnboarding({ directionChosen: true })
  }

  return (
    <div className="mx-auto max-w-4xl pt-2 pb-6">
      <header className="mb-6 text-center">
        <Hanzi className="mb-3 block text-6xl text-accent">學</Hanzi>
        <h1 className="mb-2 text-2xl font-bold">Welcome to Mandarin Leitner</h1>
        <p className="mx-auto max-w-md text-muted">
          Flashcards for Mandarin in Traditional characters and pinyin. Review a few minutes a day; each card comes back just before you would forget it.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section>
          <h2 className="mb-2 text-lg font-semibold">How the boxes work</h2>
          <LeitnerDemo config={settings.leitner} />
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">How do you want to start?</h2>
          <div className="flex flex-col gap-3">
            <Link to="/import" className={CHOICE}>
              <ChoiceBody emoji="📄" title="I have a textbook or PDF" note="Photos and screenshots work too. The AI makes the cards; you check them." />
            </Link>
            <Link to="/cards/new" className={CHOICE}>
              <ChoiceBody emoji="⌨️" title="I'll type my own words" note="Characters, pinyin and meaning; a picture if you like." />
            </Link>
            <button type="button" className={CHOICE} onClick={() => void trySample()} disabled={adding}>
              <ChoiceBody
                emoji="👀"
                title={adding ? 'Adding sample cards…' : 'Just let me try it'}
                note={`${SAMPLE_WORDS.length} sample words with pictures, straight into a review. Remove them later with one tap.`}
              />
            </button>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>

          <h2 className="mt-6 mb-2 text-lg font-semibold">How do you want to practice?</h2>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Practice direction">
            {REVIEW_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={settings.reviewMode === mode}
                onClick={() => void chooseDirection(mode)}
                className={cn(
                  'h-9 rounded-full border px-4 text-sm font-medium',
                  settings.reviewMode === mode ? 'border-transparent bg-ink text-paper' : 'border-line bg-surface text-muted',
                )}
              >
                {reviewModeInfo(mode).label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">Front: {reviewModeInfo(settings.reviewMode).front}. You can change this any time in Settings.</p>
        </section>
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        <Link className="underline" to="/help">
          Help
        </Link>{' '}
        ·{' '}
        <a className="underline" href={`${import.meta.env.BASE_URL}about.html`}>
          About
        </a>{' '}
        ·{' '}
        <a className="underline" href={`${import.meta.env.BASE_URL}privacy.html`}>
          Privacy policy
        </a>
      </p>
    </div>
  )
}
