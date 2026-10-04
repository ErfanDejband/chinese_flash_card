import { useEffect, useRef, useState } from 'react'
import { nextRotation, type Rotation } from '@/import/render'
import type { ImportSource } from '@/import/source/types'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { plural } from '@/ui/format'
import { Icon } from '@/ui/icons'
import { formatPageRanges, parsePageRanges } from './pageRanges'

export interface PickedPage {
  page: number
  rotation: Rotation
}

interface Props {
  source: ImportSource
  warning?: string
  /** Why extraction cannot start (e.g. AI not configured). */
  blockedReason?: string
  onStart(pages: PickedPage[]): void
  onCancel(): void
}

/** Thumbnails of every page (PDF page, image, or part of a long screenshot); the user picks and rotates. */
export function PagePicker({ source, warning, blockedReason, onStart, onCancel }: Props) {
  const count = source.pages.length
  const [selected, setSelected] = useState<Set<number>>(() => new Set(Array.from({ length: count }, (_, i) => i + 1)))
  const [rotations, setRotations] = useState<Record<number, Rotation>>({})
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
  const [rangeText, setRangeText] = useState('')
  const urls = useRef(new Set<string>())

  async function showThumbnail(page: number, rotation: Rotation) {
    const url = URL.createObjectURL(await source.renderThumbnail(page, rotation))
    urls.current.add(url)
    setThumbs((t) => {
      if (t[page]) {
        URL.revokeObjectURL(t[page])
        urls.current.delete(t[page])
      }
      return { ...t, [page]: url }
    })
  }

  // Render thumbnails one by one so the first pages appear quickly.
  useEffect(() => {
    let active = true
    const created = urls.current
    void (async () => {
      for (let p = 1; p <= count && active; p++) {
        try {
          await showThumbnail(p, 0)
        } catch {
          // A page that fails to render still shows its number.
        }
      }
    })()
    return () => {
      active = false
      created.forEach((u) => URL.revokeObjectURL(u))
      created.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- render once per source
  }, [source])

  const toggle = (page: number) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(page)) next.delete(page)
      else next.add(page)
      return next
    })

  function rotate(page: number) {
    const rotation = nextRotation(rotations[page] ?? 0)
    setRotations((r) => ({ ...r, [page]: rotation }))
    void showThumbnail(page, rotation).catch(() => {})
  }

  const pages = [...selected].sort((a, b) => a - b)
  const isPdf = source.kind === 'pdf'

  return (
    <div>
      <div className="mb-4">
        <h2 className="truncate text-lg font-semibold">{source.fileName}</h2>
        <p className="text-sm text-muted">
          {plural(count, isPdf ? 'page' : 'image page')} · choose the ones with vocabulary; ↻ turns a page that is sideways. Each page is one AI
          request.
        </p>
        {warning && <p className="mt-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{warning}</p>}
        {source.skipped.length > 0 && (
          <ul className="mt-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {source.skipped.map((s) => (
              <li key={s}>Skipped {s}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setSelected(new Set(Array.from({ length: count }, (_, i) => i + 1)))}>
          All
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>
          None
        </Button>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const parsed = parsePageRanges(rangeText, count)
            if (parsed.length) setSelected(new Set(parsed))
          }}
        >
          <input
            value={rangeText}
            onChange={(e) => setRangeText(e.target.value)}
            placeholder="Pages, e.g. 3-10, 15"
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
            inputMode="numeric"
          />
          <Button size="sm" type="submit" variant="secondary">
            Select
          </Button>
        </form>
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {source.pages.map((info, i) => {
          const p = i + 1
          const on = selected.has(p)
          return (
            <li key={p} className="relative">
              <button
                type="button"
                onClick={() => toggle(p)}
                aria-pressed={on}
                aria-label={`${info.label}${on ? ', selected' : ''}`}
                className={cn(
                  'relative block w-full overflow-hidden rounded-lg border-2 bg-white transition',
                  on ? 'border-accent' : 'border-transparent opacity-50',
                )}
              >
                {thumbs[p] ? (
                  <img src={thumbs[p]} alt="" className="aspect-[4/3] w-full object-contain" />
                ) : (
                  <div className="aspect-[4/3] w-full animate-pulse bg-sunken" />
                )}
                <span className={cn('absolute top-1 left-1 rounded-md px-1.5 text-xs font-bold', on ? 'bg-accent text-on-accent' : 'bg-black/60 text-white')}>
                  {p}
                </span>
              </button>
              <button
                type="button"
                onClick={() => rotate(p)}
                className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-black/60 text-base text-white"
                aria-label={`Rotate ${info.label}`}
                title="Rotate 90°"
              >
                ↻
              </button>
              {!isPdf && <p className="mt-0.5 truncate text-[11px] text-muted">{info.label}</p>}
            </li>
          )
        })}
      </ul>

      <div className="pb-safe sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] mt-4 -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0">
        <p className="mb-2 truncate text-xs text-muted">{pages.length ? `Pages ${formatPageRanges(pages)}` : 'No pages selected'}</p>
        {blockedReason && <p className="mb-2 text-sm text-amber-700 dark:text-amber-400">{blockedReason}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!pages.length || Boolean(blockedReason)}
            onClick={() => onStart(pages.map((page) => ({ page, rotation: rotations[page] ?? 0 })))}
          >
            <Icon name="sparkle" className="size-5" /> Extract {plural(pages.length, 'page')}
          </Button>
        </div>
      </div>
    </div>
  )
}
