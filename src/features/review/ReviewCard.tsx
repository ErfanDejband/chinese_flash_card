import type { Card, ReviewMode } from '@/domain/types'
import { speak, speechSupported } from '@/lib/speech'
import { boxLabel } from '@/ui/boxTones'
import { Hanzi } from '@/ui/Hanzi'
import { Icon } from '@/ui/icons'
import { MediaImage } from '@/ui/MediaImage'

/**
 * What the card shows before the answer. Picture → Chinese: the picture, else the meaning, else
 * the characters. Chinese → meaning: always the characters.
 */
type PromptKind = 'image' | 'meaning' | 'hanzi'

function promptKind(card: Card, mode: ReviewMode): PromptKind {
  if (mode === 'hanzi_to_meaning') return 'hanzi'
  if (card.imageId) return 'image'
  if (card.meaning) return 'meaning'
  return 'hanzi'
}

const QUESTION: Record<PromptKind, string> = {
  image: 'What is this?',
  meaning: 'How do you say this in Chinese?',
  hanzi: 'How is it read, and what does it mean?',
}

interface Props {
  card: Card
  box: number
  isRepeat: boolean
  revealed: boolean
  mode: ReviewMode
  voiceURI?: string
}

function Chip({ children, className = 'bg-sunken text-muted' }: { children: string; className?: string }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase ${className}`}>{children}</span>
}

export function ReviewCard({ card, box, isRepeat, revealed, mode, voiceURI }: Props) {
  const kind = promptKind(card, mode)
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-5 py-4 text-center">
      <div className="flex gap-2">
        {isRepeat ? (
          // Already answered (forgotten) this session: its box has changed, so show only that it's a re-ask.
          <Chip className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">Again</Chip>
        ) : (
          <Chip>{box === 0 ? 'New card' : boxLabel(box)}</Chip>
        )}
      </div>

      {kind === 'image' && (
        <MediaImage id={card.imageId!} alt="" className="max-h-[38dvh] min-h-40 w-full max-w-md rounded-2xl bg-white object-contain p-2 shadow-sm" />
      )}
      {kind === 'meaning' && <p className="max-w-md text-3xl leading-snug font-semibold">{card.meaning}</p>}
      {kind === 'hanzi' && <Hanzi className="text-7xl leading-tight">{card.hanzi}</Hanzi>}

      {!revealed ? (
        <p className="text-lg text-muted">{QUESTION[kind]}</p>
      ) : (
        <div className="flex animate-reveal flex-col items-center gap-2" aria-live="polite">
          {kind !== 'hanzi' && <Hanzi className="text-6xl leading-tight font-medium">{card.hanzi}</Hanzi>}
          <div className="flex items-center gap-2">
            <span className="text-2xl text-accent">{card.pinyin}</span>
            {speechSupported() && (
              <button
                type="button"
                onClick={() => speak(card.hanzi, voiceURI)}
                className="grid size-10 place-items-center rounded-full text-muted hover:bg-sunken"
                aria-label="Play pronunciation"
              >
                <Icon name="speaker" className="size-5" />
              </button>
            )}
          </div>
          {kind !== 'meaning' && card.meaning && <p className="text-lg text-muted">{card.meaning}</p>}
          {kind === 'hanzi' && card.imageId && (
            <MediaImage id={card.imageId} alt="" className="mt-2 max-h-[24dvh] w-full max-w-xs rounded-2xl bg-white object-contain p-2 shadow-sm" />
          )}
          {card.notes && <p className="mt-2 max-w-md text-sm whitespace-pre-line text-muted">{card.notes}</p>}
        </div>
      )}
    </div>
  )
}
