import { useEffect, useRef } from 'react'
import type { Card, ReviewMode } from '@/domain/types'
import { useMediaUrl } from '@/hooks/useMediaUrl'
import { speak, speechSupported } from '@/lib/speech'
import { boxLabel } from '@/ui/boxTones'
import { ExampleSentence } from '@/ui/ExampleSentence'
import { Hanzi } from '@/ui/Hanzi'
import { Icon } from '@/ui/icons'
import { MediaImage } from '@/ui/MediaImage'

/**
 * What the card shows before the answer. Picture → Chinese: the picture, else the meaning, else
 * the characters (also when the picture isn't on this device yet, e.g. still syncing).
 * Chinese → meaning: always the characters. Sound → Chinese: the word is spoken once when the
 * card appears (again with the play button, or R in the review page); a device without
 * text-to-speech shows the pinyin instead.
 */
type PromptKind = 'image' | 'meaning' | 'hanzi' | 'sound'

function promptKind(card: Card, mode: ReviewMode, pictureHere: boolean): PromptKind {
  if (mode === 'listening') return 'sound'
  if (mode === 'hanzi_to_meaning') return 'hanzi'
  if (card.imageId && pictureHere) return 'image'
  if (card.meaning) return 'meaning'
  return 'hanzi'
}

const QUESTION: Record<PromptKind, string> = {
  image: 'What is this?',
  meaning: 'How do you say this in Chinese?',
  hanzi: 'How is it read, and what does it mean?',
  sound: 'What did you hear?',
}

interface Props {
  card: Card
  box: number
  /** 1 on the card's first showing this session; higher on each re-ask. */
  attempt: number
  revealed: boolean
  mode: ReviewMode
  voiceURI?: string
}

function Chip({ children, className = 'bg-sunken text-muted' }: { children: string; className?: string }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase ${className}`}>{children}</span>
}

export function ReviewCard({ card, box, attempt, revealed, mode, voiceURI }: Props) {
  const pictureHere = !useMediaUrl(card.imageId).missing
  const kind = promptKind(card, mode, pictureHere)
  const canSpeak = speechSupported()

  // Speak the word once per showing: the review page remounts the card for every answer (so a
  // forgotten card is spoken again when it is re-asked), but not on reveal. The ref keeps
  // StrictMode's second effect run from speaking twice.
  const played = useRef(false)
  useEffect(() => {
    if (kind !== 'sound' || played.current) return
    played.current = true
    speak(card.hanzi, voiceURI)
  }, [kind, card.hanzi, voiceURI])

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-5 py-4 text-center">
      <div className="flex gap-2">
        {attempt > 1 ? (
          // Already answered (forgotten) this session: its box has changed, so show only that it's a re-ask.
          <Chip className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">{`Again · try ${attempt}`}</Chip>
        ) : (
          <Chip>{box === 0 ? 'New card' : boxLabel(box)}</Chip>
        )}
      </div>

      {kind === 'image' && (
        <MediaImage id={card.imageId!} alt="" className="max-h-[38dvh] min-h-40 w-full max-w-md rounded-2xl p-2 shadow-sm" />
      )}
      {kind === 'meaning' && <p className="max-w-md text-3xl leading-snug font-semibold">{card.meaning}</p>}
      {kind === 'hanzi' && <Hanzi className="text-7xl leading-tight">{card.hanzi}</Hanzi>}
      {/* The sound prompt makes way for the answer, which has its own play button. */}
      {kind === 'sound' &&
        !revealed &&
        (canSpeak ? (
          <button
            type="button"
            onClick={() => speak(card.hanzi, voiceURI)}
            className="grid size-24 place-items-center rounded-full bg-accent/10 text-accent hover:bg-accent/20"
            aria-label="Play the word again"
          >
            <Icon name="speaker" className="size-12" />
          </button>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <span className="text-4xl text-accent">{card.pinyin}</span>
            <span className="text-sm text-muted">This device can't speak — showing pinyin instead.</span>
          </div>
        ))}

      {!revealed ? (
        <p className="text-lg text-muted">{kind === 'sound' && !canSpeak ? 'Which word is it, and what does it mean?' : QUESTION[kind]}</p>
      ) : (
        <div className="flex animate-reveal flex-col items-center gap-2" aria-live="polite">
          {kind !== 'hanzi' && <Hanzi className="text-6xl leading-tight font-medium">{card.hanzi}</Hanzi>}
          <div className="flex items-center gap-2">
            <span className="text-2xl text-accent">{card.pinyin}</span>
            {canSpeak && (
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
          {(kind === 'hanzi' || kind === 'sound') && card.imageId && pictureHere && (
            <MediaImage id={card.imageId} alt="" className="mt-2 max-h-[24dvh] w-full max-w-xs rounded-2xl p-2 shadow-sm" />
          )}
          {card.example && <ExampleSentence example={card.example} word={card.hanzi} className="mt-2 max-w-md" />}
          {card.notes && <p className="mt-2 max-w-md text-sm whitespace-pre-line text-muted">{card.notes}</p>}
        </div>
      )}
    </div>
  )
}
