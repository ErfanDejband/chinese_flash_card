import { Link } from 'react-router'
import { Icon } from './icons'

/** Floating "+ Add card" button, above the mobile bottom nav. */
export function AddCardFab() {
  return (
    <Link
      to="/cards/new"
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex h-14 items-center gap-2 rounded-full bg-accent pr-5 pl-4 font-semibold text-on-accent shadow-lg shadow-black/20 transition active:scale-95 md:right-8 md:bottom-8"
    >
      <Icon name="plus" />
      Add card
    </Link>
  )
}
