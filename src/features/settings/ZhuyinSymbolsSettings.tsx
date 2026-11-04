import { useState } from 'react'
import { deleteCardsByTag } from '@/data/repositories/cards'
import type { AppSettings } from '@/domain/types'
import { spokenText, ZHUYIN_LESSONS, ZHUYIN_SYMBOLS, ZHUYIN_TAG, type ZhuyinSymbol } from '@/domain/zhuyinSymbols'
import { useDeck } from '@/hooks/useDeck'
import { speak, speechSupported } from '@/lib/speech'
import { Button } from '@/ui/Button'
import { plural } from '@/ui/format'
import { Hanzi } from '@/ui/Hanzi'
import { addZhuyinDeck } from './zhuyinDeck'

/** All the symbols by lesson; a tap says one and shows its hint. */
function SymbolChart({ voiceURI }: { voiceURI?: string }) {
  const [heard, setHeard] = useState<ZhuyinSymbol>()

  function play(symbol: ZhuyinSymbol) {
    setHeard(symbol)
    speak(spokenText({ hanzi: symbol.symbol }), voiceURI)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="min-h-10 text-sm text-muted" aria-live="polite">
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
      <ol className="flex flex-col gap-1.5">
        {ZHUYIN_LESSONS.map((lesson, i) => (
          <li key={i} className="grid grid-cols-5 gap-1.5" aria-label={`Lesson ${i + 1}`}>
            {lesson.map((s) => (
              <button
                key={s.symbol}
                type="button"
                onClick={() => play(s)}
                className="flex flex-col items-center rounded-xl border border-line bg-paper px-1 py-1.5 hover:bg-sunken"
                aria-label={`${s.symbol}: ${s.hint}`}
              >
                <Hanzi className="text-2xl leading-tight">{s.symbol}</Hanzi>
                <span className="text-xs text-muted">{s.pinyin}</span>
              </button>
            ))}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The symbol cards: add or remove them, and a chart to hear every sound. */
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

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Learn the 37 symbols with cards: the symbol on the front, its pinyin, a hint and its sound on the back. They come before your other new cards, in lesson order and
        within your daily limit.
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
      <SymbolChart voiceURI={settings.ttsVoiceURI} />
    </div>
  )
}
