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
  /** False for a picture of the shelf (the demo): the boxes don't open. */
  linked?: boolean
  /** One box drawn raised, its top card showing `face` (the demo card). */
  highlight?: { box: number; face: string }
  /** Boxes may shrink below their usual width, to fit a phone inside a card. */
  compact?: boolean
}

// Per-card tilt (deg) and sideways shift (px) so a stack reads as loose index cards.
const TILT = [-5, 4, -2, 6, -6, 3, -1]
const SHIFT = [-3, 4, -1, 3, -4, 2, 0]
const MAX_STACK = TILT.length

interface ColumnProps extends BoxSummary {
  boxCount: number
  linked: boolean
  compact: boolean
  face?: string
}

function BoxColumn({ box, total, due, boxCount, linked, compact, face }: ColumnProps) {
  const tone = boxTone(box, boxCount)
  const stack = Math.min(total, MAX_STACK)
  const content = (
    <>
      <div className="relative h-28 w-full">
        <div
          className={cn(
            'absolute inset-0 transition duration-200 group-hover:-translate-y-1.5 group-active:-translate-y-1.5 motion-reduce:transition-none',
            face !== undefined && '-translate-y-1.5',
          )}
        >
          {Array.from({ length: stack }, (_, i) => (
            <span
              key={i}
              className={cn(
                'absolute bottom-7 left-1/2 grid h-14 w-[62%] place-items-center rounded-md border border-amber-900/15 bg-[#fffaf0] shadow-sm dark:border-black/40 dark:bg-stone-300',
                compact ? 'text-xl' : 'text-2xl',
                face !== undefined && i === stack - 1 && 'animate-reveal',
              )}
              style={{ transform: `translateX(calc(-50% + ${SHIFT[i]}px)) translateY(${-i * 6}px) rotate(${TILT[i]}deg)` }}
            >
              {i === stack - 1 && face}
            </span>
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
    </>
  )
  const className = cn(
    'group flex flex-1 flex-col items-center rounded-xl pb-1 focus-visible:outline-2 focus-visible:outline-accent',
    compact ? 'min-w-0' : 'min-w-14',
    face !== undefined && 'bg-accent/10',
  )
  if (!linked) return <div className={className}>{content}</div>
  return (
    <Link to={`/boxes/${box}`} className={className} aria-label={`${boxLabel(box)}: ${total} cards${box > 0 ? `, ${due} due` : ''}`}>
      {content}
    </Link>
  )
}

export function BoxesView({ notStarted, boxes, linked = true, highlight, compact = false }: BoxesViewProps) {
  const count = boxes.length
  const face = (box: number) => (highlight?.box === box ? highlight.face : undefined)
  return (
    <div className={cn('-mx-1 flex items-end overflow-x-auto px-1 pt-2', compact ? 'gap-1.5' : 'gap-2 sm:gap-4')}>
      <BoxColumn box={0} total={notStarted} due={0} boxCount={count} linked={linked} compact={compact} face={face(0)} />
      <div className="mb-10 h-20 w-px shrink-0 bg-line" aria-hidden="true" />
      {boxes.map((b) => (
        <BoxColumn key={b.box} {...b} boxCount={count} linked={linked} compact={compact} face={face(b.box)} />
      ))}
    </div>
  )
}
