import { useState } from 'react'
import { deleteCardsByTag, removeTag } from '@/data/repositories/cards'
import { SAMPLE_TAG } from '@/domain/sampleDeck'
import { Button } from '@/ui/Button'
import { plural } from '@/ui/format'

/** On Home while the deck holds sample cards: remove them, or keep them as ordinary cards. */
export function SampleBanner({ count }: { count: number }) {
  const [busy, setBusy] = useState(false)
  if (count === 0) return null

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-4 rounded-2xl border border-line bg-surface p-4 text-sm">
      <p>
        <span className="font-semibold">{plural(count, 'sample card')}</span> from trying the app. Keep them, or remove them and start with your own words.
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (confirm(`Remove the ${plural(count, 'sample card')} and their progress?`)) void run(() => deleteCardsByTag(SAMPLE_TAG))
          }}
        >
          Remove them
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => removeTag(SAMPLE_TAG))}>
          Keep them
        </Button>
      </div>
    </section>
  )
}
