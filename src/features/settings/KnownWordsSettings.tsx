import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { addKnownWords, listKnownWords, removeKnownWord } from '@/data/repositories/knownWords'
import { Button } from '@/ui/Button'
import { plural } from '@/ui/format'
import { Hanzi } from '@/ui/Hanzi'

/** Show a filter once the list no longer fits at a glance. */
const FILTER_FROM = 30

/** Words the learner knows without having a card: imports switch them off. Synced. */
export function KnownWordsSettings() {
  const words = useLiveQuery(() => listKnownWords(), [])
  const [input, setInput] = useState('')
  const [filter, setFilter] = useState('')
  if (!words) return null

  async function add(e: FormEvent) {
    e.preventDefault()
    await addKnownWords(input.split(/[\s,，、;；]+/))
    setInput('')
  }

  const shown = filter.trim() ? words.filter((w) => w.id.includes(filter.trim())) : words

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted">
        {words.length ? `${plural(words.length, 'word')}. ` : ''}Imports switch these off, so you only add words you don’t know yet. Mark a word
        with “I know this” while reviewing an import, or add it here.
      </p>
      <form onSubmit={(e) => void add(e)} className="flex gap-2">
        <input
          lang="zh-Hant"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="我 你 是 的"
          aria-label="Words to add"
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 outline-none focus:border-accent"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!input.trim()}>
          Add
        </Button>
      </form>
      {words.length > FILTER_FROM && (
        <input
          type="search"
          lang="zh-Hant"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a word"
          aria-label="Find a known word"
          className="h-10 rounded-xl border border-line bg-paper px-3 outline-none focus:border-accent"
        />
      )}
      {shown.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {shown.map((w) => (
            <li key={w.id} className="flex items-center rounded-full border border-line bg-paper pl-3 text-base">
              <Hanzi>{w.id}</Hanzi>
              <button
                type="button"
                onClick={() => void removeKnownWord(w.id)}
                className="grid size-8 place-items-center rounded-full text-muted hover:text-ink"
                aria-label={`Remove ${w.id}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
