import { useState } from 'react'
import { deleteCardsByTag } from '@/data/repositories/cards'
import type { AppSettings } from '@/domain/types'
import { outdatedSymbolCards, ZHUYIN_GROUPS, ZHUYIN_SYMBOLS, ZHUYIN_TAG, ZHUYIN_TONES, type ZhuyinTile } from '@/domain/zhuyinSymbols'
import { useDeck } from '@/hooks/useDeck'
import { speak, speechSupported } from '@/lib/speech'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { plural } from '@/ui/format'
import { Hanzi } from '@/ui/Hanzi'
import { Icon } from '@/ui/icons'
import { addZhuyinDeck, refreshZhuyinCards } from './zhuyinDeck'

function Tile({ tile, onPlay, small }: { tile: ZhuyinTile; onPlay: (tile: ZhuyinTile) => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onPlay(tile)}
      className="flex flex-col items-center rounded-xl border border-line bg-paper px-1 py-1.5 hover:bg-sunken"
      aria-label={`${tile.symbol}: ${tile.hint}`}
    >
      <Hanzi className={cn('leading-tight whitespace-nowrap', small ? 'text-base' : 'text-2xl')}>{tile.symbol}</Hanzi>
      <span className="text-xs text-muted">{tile.pinyin}</span>
    </button>
  )
}

/** All the symbols in teaching order, folded away; a tap says one and shows its hint. */
function SymbolChart({ voiceURI }: { voiceURI?: string }) {
  const [heard, setHeard] = useState<ZhuyinTile>()

  function play(tile: ZhuyinTile) {
    setHeard(tile)
    speak(tile.speak, voiceURI)
  }

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-1 font-semibold [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">Hear all 37 symbols</span>
        <Icon name="chevron" className="size-5 shrink-0 text-muted transition group-open:rotate-90 motion-reduce:transition-none" />
      </summary>
      <div className="mt-2 flex flex-col gap-5">
        {/* Stays in view: the tiles run longer than a phone screen. */}
        <p className="sticky top-0 z-10 min-h-11 bg-surface py-1 text-sm text-muted md:top-16" aria-live="polite">
          {heard ? (
            <>
              <Hanzi className="font-semibold text-ink">{heard.symbol}</Hanzi> {heard.pinyin} · {heard.hint}
            </>
          ) : speechSupported() ? (
            'Tap a symbol to hear it.'
          ) : (
            'This browser has no text-to-speech, so a tap only shows the hint.'
          )}
        </p>
        {ZHUYIN_GROUPS.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3 className="text-sm font-semibold">{group.title}</h3>
            <p className="mb-2 text-sm text-muted">{group.note}</p>
            <div className="flex flex-col gap-1.5">
              {group.rows.map((row, i) => (
                <div key={i} className="grid grid-cols-4 gap-1.5">
                  {row.map((s) => (
                    <Tile key={s.symbol} tile={s} onPlay={play} />
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
        <section aria-label="Tone marks">
          <h3 className="text-sm font-semibold">Tone marks</h3>
          <p className="mb-2 text-sm text-muted">They follow the syllable. The first tone has no mark, and the neutral tone’s ˙ goes in front.</p>
          <div className="grid grid-cols-5 gap-1.5">
            {ZHUYIN_TONES.map((t) => (
              <Tile key={t.pinyin} tile={t} onPlay={play} small />
            ))}
          </div>
        </section>
      </div>
    </details>
  )
}

/** The symbol cards: add, update or remove them, and a chart to hear every sound. */
export function ZhuyinSymbolsSettings({ settings }: { settings: AppSettings }) {
  const deck = useDeck()
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  const added = deck?.filter((e) => e.card.tags.includes(ZHUYIN_TAG)) ?? []
  const started = added.filter((e) => e.state.box > 0).length
  const inDeck = new Set(deck?.map((e) => e.card.hanzi))
  const missing = ZHUYIN_SYMBOLS.filter((s) => !inDeck.has(s.symbol)).length
  const outdated = outdatedSymbolCards(added.map((e) => e.card))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Learn the 37 symbols with cards: the symbol on the front, its pinyin, a hint and its sound on the back. They come before your other new cards, in ㄅㄆㄇㄈ order and within
        your daily limit.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {deck && missing > 0 && (
          <Button size="sm" disabled={busy} onClick={() => void run(addZhuyinDeck)}>
            {added.length === 0 ? 'Add the 37 symbol cards' : `Add the ${missing} missing`}
          </Button>
        )}
        {added.length > 0 && (
          <>
            <span className="text-sm text-muted">
              {plural(added.length, 'symbol card')}, {started} started
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (confirm(`Remove the ${plural(added.length, 'symbol card')} and their progress?`)) void run(() => deleteCardsByTag(ZHUYIN_TAG))
              }}
            >
              Remove them
            </Button>
          </>
        )}
      </div>
      {outdated.length > 0 && (
        <div className="flex flex-col items-start gap-2 rounded-2xl bg-sunken p-3 text-sm">
          <p>Better hints and example words are ready. Your progress and notes stay; any changes you made to these cards’ pinyin, hint or example are replaced.</p>
          <Button size="sm" disabled={busy} onClick={() => void run(() => refreshZhuyinCards(outdated))}>
            Update {plural(outdated.length, 'card')}
          </Button>
        </div>
      )}
      <SymbolChart voiceURI={settings.ttsVoiceURI} />
    </div>
  )
}
