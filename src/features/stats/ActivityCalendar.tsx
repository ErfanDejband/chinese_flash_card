import { useState } from 'react'
import { activityLevel, calendarWeeks, type DayActivity } from '@/domain/stats'
import type { LocalDate } from '@/domain/types'
import { cn } from '@/ui/cn'
import { plural, shortDay, shortMonth } from '@/ui/format'

const WEEKS = 18

/**
 * One sequential hue (the accent orange), more reviews = more contrast with the surface.
 * Steps checked with the dataviz palette validator against #ffffff and #1f1b17.
 */
const LEVEL_FILL = [
  'bg-sunken',
  'bg-orange-400 dark:bg-orange-800',
  'bg-orange-600 dark:bg-orange-600',
  'bg-orange-700 dark:bg-orange-400',
  'bg-orange-900 dark:bg-orange-200',
]

const ROW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', '']

function describe(day: LocalDate, a: DayActivity | undefined): string {
  return a ? `${shortDay(day)} · ${plural(a.reviews, 'review')} (${a.knew} known)` : `${shortDay(day)} · no reviews`
}

/** The last 18 weeks, a column per week (Monday on top); tap or hover a day for its numbers. */
export function ActivityCalendar({ activity, today }: { activity: Map<LocalDate, DayActivity>; today: LocalDate }) {
  const [selected, setSelected] = useState<LocalDate>(today)
  const weeks = calendarWeeks(today, WEEKS)
  const max = Math.max(0, ...weeks.flat().map((d) => (d ? (activity.get(d)?.reviews ?? 0) : 0)))

  // A month label above the week holding its 1st day (and the first column, unless a month starts right after it).
  const monthLabels = weeks.map((week, i) => {
    const first = week.find((d) => d?.endsWith('-01'))
    if (first) return shortMonth(first)
    if (i === 0 && !weeks.slice(1, 3).some((w) => w.some((d) => d?.endsWith('-01')))) return shortMonth(week[0]!)
    return ''
  })

  return (
    <div className="mt-5">
      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        <span />
        <div className="grid grid-cols-[repeat(18,minmax(0,1fr))] gap-[3px] pb-1 text-[10px] text-muted">
          {monthLabels.map((label, i) => (
            <span key={i} className="whitespace-nowrap">
              {label}
            </span>
          ))}
        </div>
        <div className="grid grid-rows-7 gap-[3px] text-[10px] leading-none text-muted">
          {ROW_LABELS.map((label, i) => (
            <span key={i} className="flex items-center">
              {label}
            </span>
          ))}
        </div>
        <div className="grid grid-flow-col grid-cols-[repeat(18,minmax(0,1fr))] grid-rows-7 gap-[3px]">
          {weeks.flat().map((day, i) =>
            day ? (
              <button
                key={day}
                type="button"
                onClick={() => setSelected(day)}
                onMouseEnter={() => setSelected(day)}
                onFocus={() => setSelected(day)}
                aria-label={describe(day, activity.get(day))}
                aria-pressed={day === selected}
                className={cn(
                  'aspect-square rounded-[3px]',
                  LEVEL_FILL[activityLevel(activity.get(day)?.reviews ?? 0, max)],
                  day === selected && 'ring-2 ring-ink ring-offset-1 ring-offset-surface',
                )}
              />
            ) : (
              <span key={`future-${i}`} />
            ),
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted" aria-live="polite">
          {describe(selected, activity.get(selected))}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted" aria-hidden="true">
          Less
          {LEVEL_FILL.map((fill) => (
            <span key={fill} className={cn('size-3 rounded-[3px]', fill)} />
          ))}
          More
        </span>
      </div>
    </div>
  )
}
