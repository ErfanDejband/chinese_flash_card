import { useState } from 'react'
import type { BoxSnapshot } from '@/domain/stats'
import { boxLabel, boxTone } from '@/ui/boxTones'
import { cn } from '@/ui/cn'
import { monthDay, plural } from '@/ui/format'

const sum = (counts: number[]) => counts.reduce((a, b) => a + b, 0)

/**
 * Started cards per box at the end of each week, stacked from box 1 (bottom) to the top box.
 * Box fills are the shelf's colours; a legend with the newest week's counts and a table view
 * keep identity readable without colour.
 */
export function BoxHistoryChart({ history }: { history: BoxSnapshot[] }) {
  const [selected, setSelected] = useState(history.length - 1)
  const boxCount = history[0]?.counts.length ?? 0
  const max = Math.max(1, ...history.map((h) => sum(h.counts)))
  const latest = history[history.length - 1]
  const shown = history[selected] ?? latest
  if (!latest || !shown) return null

  return (
    <div>
      {/* Top padding leaves room for the newest column's total above the tallest bar. */}
      <div className="flex h-44 items-end gap-1.5 border-b border-line pt-5 sm:gap-2" role="group" aria-label="Cards per box, week by week">
        {history.map((h, i) => {
          const total = sum(h.counts)
          return (
            <button
              key={h.end}
              type="button"
              onClick={() => setSelected(i)}
              onMouseEnter={() => setSelected(i)}
              onFocus={() => setSelected(i)}
              aria-pressed={i === selected}
              aria-label={`Week ending ${monthDay(h.end)}: ${plural(total, 'card')}`}
              className={cn('relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-md', i === selected && 'bg-sunken')}
            >
              {i === history.length - 1 && total > 0 && (
                <span className="absolute inset-x-0 text-center text-xs font-semibold text-ink tabular-nums" style={{ bottom: `calc(${(total / max) * 100}% + 2px)` }}>
                  {total}
                </span>
              )}
              <span className="flex w-full flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]" style={{ height: `${(total / max) * 100}%` }}>
                {h.counts.map((count, b) =>
                  count > 0 ? <span key={b} className={cn('min-h-[2px] w-full', boxTone(b + 1, boxCount).fill)} style={{ flexGrow: count, flexBasis: 0 }} /> : null,
                )}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex gap-1.5 text-[10px] text-muted sm:gap-2">
        {history.map((h, i) => (
          <span key={h.end} className="min-w-0 flex-1 text-center whitespace-nowrap">
            {(history.length - 1 - i) % 4 === 0 ? monthDay(h.end) : ''}
          </span>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted" aria-live="polite">
        Week ending {monthDay(shown.end)}: {plural(sum(shown.counts), 'card')}
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {shown.counts.map((count, b) => (
          <li key={b} className="flex items-center gap-1.5">
            <span className={cn('size-3 rounded-[3px]', boxTone(b + 1, boxCount).fill)} aria-hidden="true" />
            <span className="text-muted">{boxLabel(b + 1)}</span>
            <span className="font-semibold tabular-nums">{count}</span>
          </li>
        ))}
      </ul>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">Show as table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-right tabular-nums">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 pr-2 text-left font-medium">Week ending</th>
                {latest.counts.map((_, b) => (
                  <th key={b} className="px-1 py-1 font-medium">
                    {b + 1}
                  </th>
                ))}
                <th className="py-1 pl-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((h) => (
                <tr key={h.end} className="border-t border-line">
                  <td className="py-1 pr-2 text-left">{monthDay(h.end)}</td>
                  {h.counts.map((c, b) => (
                    <td key={b} className="px-1 py-1">
                      {c}
                    </td>
                  ))}
                  <td className="py-1 pl-2 font-semibold">{sum(h.counts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
