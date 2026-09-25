import { Link } from 'react-router'
import type { BoxSummary } from '@/domain/deck'
import { boxLabel, boxTone } from '@/ui/boxTones'
import { cn } from '@/ui/cn'
import { Hanzi } from '@/ui/Hanzi'

/**
 * 2D Leitner shelf: one file box per Leitner box, cards peeking out in proportion to its size.
 * Takes plain data only, so an animated/3D renderer can replace it without touching any logic.
 */
export interface BoxesViewProps {
  notStarted: number
  boxes: BoxSummary[]
}

// Per-card tilt (deg) and sideways shift (px) so a stack reads as loose index cards.
const TILT = [-5, 4, -2, 6, -6, 3, -1]
const SHIFT = [-3, 4, -1, 3, -4, 2, 0]
const MAX_STACK = TILT.length

function BoxColumn({ box, total, due, boxCount }: BoxSummary & { boxCount: number }) {
  const tone = boxTone(box, boxCount)
  const stack = Math.min(total, MAX_STACK)
  return (
    <Link
      to={`/boxes/${box}`}
      className="group flex min-w-14 flex-1 flex-col items-center rounded-xl pb-1 focus-visible:outline-2 focus-visible:outline-accent"
      aria-label={`${boxLabel(box)}: ${total} cards${box > 0 ? `, ${due} due` : ''}`}
    >
      <div className="relative h-28 w-full">
        <div className="absolute inset-0 transition duration-200 group-hover:-translate-y-1.5 group-active:-translate-y-1.5">
          {Array.from({ length: stack }, (_, i) => (
            <span
              key={i}
              className="absolute bottom-7 left-1/2 h-14 w-[62%] rounded-md border border-amber-900/15 bg-[#fffaf0] shadow-sm dark:border-black/40 dark:bg-stone-300"
              style={{ transform: `translateX(calc(-50% + ${SHIFT[i]}px)) translateY(${-i * 6}px) rotate(${TILT[i]}deg)` }}
            />
          ))}
        </div>
        <div className={cn('absolute inset-x-0 bottom-0 grid h-14 place-items-center rounded-lg rounded-t-sm bg-linear-to-b shadow-md', tone.front)}>
          <span className="text-xl font-bold text-white drop-shadow-sm">{box === 0 ? <Hanzi>新</Hanzi> : box}</span>
        </div>
        {box > 0 && due > 0 && (
          <span className="absolute top-0 right-0 min-w-6 rounded-full bg-accent px-1.5 text-center text-xs leading-6 font-bold text-on-accent shadow">
            {due}
          </span>
        )}
      </div>
      <div className="mt-2 text-sm font-semibold tabular-nums">{total}</div>
      <div className="text-[11px] leading-tight text-muted">{box === 0 ? 'new' : `box ${box}`}</div>
    </Link>
  )
}

export function BoxesView({ notStarted, boxes }: BoxesViewProps) {
  const count = boxes.length
  return (
    <div className="-mx-1 flex items-end gap-2 overflow-x-auto px-1 pt-2 sm:gap-4">
      <BoxColumn box={0} total={notStarted} due={0} boxCount={count} />
      <div className="mb-10 h-20 w-px shrink-0 bg-line" aria-hidden="true" />
      {boxes.map((b) => (
        <BoxColumn key={b.box} {...b} boxCount={count} />
      ))}
    </div>
  )
}
