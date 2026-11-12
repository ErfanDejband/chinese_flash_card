import { useEffect, useRef } from 'react'
import { isGrammar } from '@/domain/grammar'
import type { Card, ReviewMode } from '@/domain/types'
import { spokenText, symbolInfo } from '@/domain/zhuyinSymbols'
import { useMediaUrl } from '@/hooks/useMediaUrl'
import { speak, speechSupported } from '@/lib/speech'
import { boxLabel } from '@/ui/boxTones'
import { ExampleSentence } from '@/ui/ExampleSentence'
import { Hanzi } from '@/ui/Hanzi'
import { Icon } from '@/ui/icons'
import { MediaImage } from '@/ui/MediaImage'
import { Reading } from '@/ui/Reading'
import { promptKind, type PromptKind } from './prompt'

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
  const symbol = symbolInfo(card.hanzi)
  const grammar = isGrammar(card)
  const spoken = spokenText(card)

  // Speak the word once per showing: the review page remounts the card for every answer (so a
  // forgotten card is spoken again when it is re-asked), but not on reveal. The ref keeps
  // StrictMode's second effect run from speaking twice.
  const played = useRef(false)
  useEffect(() => {
    if (kind !== 'sound' || played.current) return
    played.current = true
    speak(spoken, voiceURI)
  }, [kind, spoken, voiceURI])

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-5 py-4 text-center">
      <div className="flex gap-2">
        {attempt > 1 ? (
          // Already answered (forgotten) this session: its box has changed, so show only that it's a re-ask.
          <Chip className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">{`Again · try ${attempt}`}</Chip>
        ) : (
          <Chip>{box === 0 ? 'New card' : boxLabel(box)}</Chip>
        )}
        {grammar && <Chip className="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">Grammar</Chip>}
      </div>

      {kind === 'image' && (
        <MediaImage id={card.imageId!} alt="" className="max-h-[38dvh] min-h-40 w-full max-w-md rounded-2xl p-2 shadow-sm" />
      )}
      {kind === 'meaning' && <p className="max-w-md text-3xl leading-snug font-semibold">{card.meaning}</p>}
      {kind === 'hanzi' && <Hanzi className={grammar ? 'text-5xl leading-tight' : 'text-7xl leading-tight'}>{card.hanzi}</Hanzi>}
      {/* The sound prompt makes way for the answer, which has its own play button. */}
      {kind === 'sound' &&
        !revealed &&
        (canSpeak ? (
          <button
            type="button"
            onClick={() => speak(spoken, voiceURI)}
            className="grid size-24 place-items-center rounded-full bg-accent/10 text-accent hover:bg-accent/20"
            aria-label="Play the sound again"
          >
            <Icon name="speaker" className="size-12" />
          </button>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Reading pinyin={card.pinyin} hanzi={card.hanzi} className="text-4xl text-accent" />
            <span className="text-sm text-muted">This device can't speak — showing the reading instead.</span>
          </div>
        ))}

      {!revealed ? (
        <p className="text-lg text-muted">{kind === 'sound' && !canSpeak ? 'Which word is it, and what does it mean?' : kind === 'hanzi' && symbol ? 'How does it sound?' : QUESTION[kind]}</p>
      ) : (
        <div className="flex animate-reveal flex-col items-center gap-2" aria-live="polite">
          {kind !== 'hanzi' && <Hanzi className={grammar ? 'text-4xl leading-tight font-medium' : 'text-6xl leading-tight font-medium'}>{card.hanzi}</Hanzi>}
          <div className="flex items-center gap-2">
            <Reading pinyin={card.pinyin} hanzi={card.hanzi} className="text-2xl text-accent" />
            {canSpeak && (
              <button
                type="button"
                onClick={() => speak(spoken, voiceURI)}
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
          {card.example && <ExampleSentence example={card.example} word={card.hanzi} reading={symbol ? 'both' : undefined} className="mt-2 max-w-md" />}
          {card.notes && <p className="mt-2 max-w-md text-sm whitespace-pre-line text-muted">{card.notes}</p>}
        </div>
      )}
    </div>
  )
}
