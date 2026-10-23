import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { createCard, hasCard } from '@/data/repositories/cards'
import { useOnboardingReady } from '@/hooks/useBrowser'
import { getOnboarding, markTipSeen } from '@/lib/onboarding'
import { cn } from '@/ui/cn'
import { Hanzi } from '@/ui/Hanzi'
import { Icon } from '@/ui/icons'
import { TIP_WORD, TIPS, type HelpWord, type TipId } from './tips'

/** A help word with "+ add" (or "✓ in your deck"). */
export function HelpWordLine({ word }: { word: HelpWord }) {
  const inDeck = useLiveQuery(() => hasCard(word.hanzi), [word.hanzi])
  const [adding, setAdding] = useState(false)

  async function add() {
    setAdding(true)
    try {
      await createCard({ hanzi: word.hanzi, pinyin: word.pinyin, meaning: word.meaning })
    } finally {
      setAdding(false)
    }
  }

  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <Hanzi className="text-lg font-semibold">{word.hanzi}</Hanzi>
      <span className="text-accent">{word.pinyin}</span>
      <span className="text-muted">{word.meaning}</span>
      {inDeck ? (
        <span className="text-xs text-muted">✓ in your deck</span>
      ) : (
        <button type="button" onClick={() => void add()} disabled={adding || inDeck === undefined} className="text-xs font-semibold text-accent underline">
          + add {word.hanzi}
        </button>
      )}
    </span>
  )
}

function TipBox({ id, className }: { id: TipId; className?: string }) {
  // Seen as soon as it appears, so it never comes back; ✕ only hides it sooner.
  const [show, setShow] = useState(() => !getOnboarding().seenTips.includes(id))
  useEffect(() => {
    if (show) markTipSeen(id)
  }, [id, show])
  if (!show) return null

  const tip = TIPS[id]
  return (
    <aside className={cn('rounded-2xl border border-accent/30 bg-accent/5 p-3 text-left text-sm', className)} aria-label="Tip">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-accent">
            💡 <Hanzi>{TIP_WORD.hanzi}</Hanzi> {TIP_WORD.pinyin} · {TIP_WORD.meaning}
          </p>
          <p className="mt-1">
            {tip.body}
            {tip.topic && (
              <>
                {' '}
                <Link to={`/help?topic=${tip.topic}`} className="font-semibold whitespace-nowrap text-accent">
                  More →
                </Link>
              </>
            )}
          </p>
          <div className="mt-2">
            <HelpWordLine word={tip.word} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken"
          aria-label="Close tip"
        >
          <Icon name="x" className="size-4" />
        </button>
      </div>
    </aside>
  )
}

/** A tip shown once on this device, the first time its screen or moment comes up. */
export function Tip(props: { id: TipId; className?: string }) {
  // Wait for the start-up check, which marks every tip seen on a device that was already in use.
  if (!useOnboardingReady()) return null
  // Keyed by id: a different tip in the same spot (Show answer → Knew/Forgot) is a new one.
  return <TipBox key={props.id} {...props} />
}
