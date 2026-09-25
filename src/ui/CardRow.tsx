import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Card } from '@/domain/types'
import { Hanzi } from './Hanzi'
import { MediaImage } from './MediaImage'

export function CardThumb({ card, className = 'size-12' }: { card: Card; className?: string }) {
  return card.imageId ? (
    <MediaImage id={card.imageId} alt={card.meaning ?? card.hanzi} className={`${className} shrink-0 rounded-lg bg-white object-contain`} />
  ) : (
    <div className={`${className} grid shrink-0 place-items-center rounded-lg bg-sunken text-lg text-muted`}>
      <Hanzi>{[...card.hanzi][0]}</Hanzi>
    </div>
  )
}

export function CardRow({ card, trailing }: { card: Card; trailing?: ReactNode }) {
  return (
    <li>
      <Link to={`/cards/${card.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-sunken">
        <CardThumb card={card} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <Hanzi className="text-xl font-medium">{card.hanzi}</Hanzi>
            <span className="truncate text-muted">{card.pinyin}</span>
          </div>
          {card.meaning && <div className="truncate text-sm text-muted">{card.meaning}</div>}
        </div>
        {trailing}
      </Link>
    </li>
  )
}
