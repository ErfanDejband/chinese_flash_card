import { Link } from 'react-router'
import type { Release } from './releases'

/** A release's items as a list. With `onShow`, an item with a route gets a "Show me" link (`onShow` runs first). */
export function ReleaseItems({ items, onShow }: { items: Release['items']; onShow?: () => void }) {
  return (
    <ul className="flex flex-col gap-2.5 text-sm">
      {items.map((item) => (
        <li key={item.text} className="flex gap-3">
          <span className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <div className="min-w-0">
            <p>{item.text}</p>
            {onShow && item.to && (
              <Link to={item.to} onClick={onShow} className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline">
                Show me →
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
