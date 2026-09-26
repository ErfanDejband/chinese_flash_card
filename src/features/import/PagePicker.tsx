import { useEffect, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { renderThumbnail } from '@/import/pdf/pdf'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { plural } from '@/ui/format'
import { formatPageRanges, parsePageRanges } from './pageRanges'

interface Props {
  doc: PDFDocumentProxy
  fileName: string
  warning?: string
  /** Why extraction cannot start (e.g. AI not configured). */
  blockedReason?: string
  onStart(pages: number[]): void
  onCancel(): void
}

/** Thumbnails of every page; the user picks which pages are sent to the AI. */
export function PagePicker({ doc, fileName, warning, blockedReason, onStart, onCancel }: Props) {
  const count = doc.numPages
  const [selected, setSelected] = useState<Set<number>>(() => new Set(Array.from({ length: count }, (_, i) => i + 1)))
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
  const [rangeText, setRangeText] = useState('')

  // Render thumbnails one by one so the first pages appear quickly.
  useEffect(() => {
    let active = true
    const urls: string[] = []
    void (async () => {
      for (let p = 1; p <= count && active; p++) {
        try {
          const url = URL.createObjectURL(await renderThumbnail(doc, p))
          urls.push(url)
          if (active) setThumbs((t) => ({ ...t, [p]: url }))
        } catch {
          // A page that fails to render still shows its number.
        }
      }
    })()
    return () => {
      active = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [doc, count])

  const toggle = (page: number) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(page)) next.delete(page)
      else next.add(page)
      return next
    })

  const pages = [...selected].sort((a, b) => a - b)

  return (
    <div>
      <div className="mb-4">
        <h2 className="truncate text-lg font-semibold">{fileName}</h2>
        <p className="text-sm text-muted">
          {plural(count, 'page')} · choose the pages with vocabulary. Each page is one AI request.
        </p>
        {warning && <p className="mt-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{warning}</p>}
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
        {Array.from({ length: count }, (_, i) => i + 1).map((p) => {
          const on = selected.has(p)
          return (
            <li key={p}>
              <button
                type="button"
                onClick={() => toggle(p)}
                aria-pressed={on}
                className={cn(
                  'relative block w-full overflow-hidden rounded-lg border-2 bg-white transition',
                  on ? 'border-accent' : 'border-transparent opacity-50',
                )}
              >
                {thumbs[p] ? (
                  <img src={thumbs[p]} alt={`Page ${p}`} className="aspect-video w-full object-contain" />
                ) : (
                  <div className="aspect-video w-full animate-pulse bg-sunken" />
                )}
                <span className={cn('absolute top-1 left-1 rounded-md px-1.5 text-xs font-bold', on ? 'bg-accent text-on-accent' : 'bg-black/60 text-white')}>
                  {p}
                </span>
              </button>
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
          <Button className="flex-1" disabled={!pages.length || Boolean(blockedReason)} onClick={() => onStart(pages)}>
            Extract {plural(pages.length, 'page')}
          </Button>
        </div>
      </div>
    </div>
  )
}
