import { NavLink, Outlet, ScrollRestoration } from 'react-router'
import { summarizeDeck } from '@/domain/deck'
import { useDeck, useSettings } from '@/hooks/useDeck'
import { useToday } from '@/hooks/useToday'
import { cn } from '@/ui/cn'
import { Icon, type IconName } from '@/ui/icons'

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/review', label: 'Review', icon: 'review' },
  { to: '/cards', label: 'Cards', icon: 'cards' },
  { to: '/import', label: 'Import', icon: 'import' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

function useTodayCount(): number {
  const deck = useDeck()
  const settings = useSettings()
  const today = useToday()
  if (!deck || !settings) return 0
  const s = summarizeDeck(deck, today, settings.leitner, settings.newPerDay)
  return s.due + s.newToday
}

function Badge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span className="absolute -top-1 left-1/2 ml-1.5 min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] leading-5 font-bold text-on-accent">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function AppLayout() {
  const todayCount = useTodayCount()

  return (
    <div className="min-h-dvh">
      {/* Desktop top bar */}
      <header className="sticky top-0 z-30 hidden border-b border-line bg-paper/90 backdrop-blur md:block">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-6 px-6">
          <span className="text-lg font-bold">
            <span lang="zh-Hant" className="text-accent">
              學
            </span>{' '}
            Leitner
          </span>
          <nav className="flex gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn('relative rounded-lg px-3 py-2 font-medium', isActive ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')
                }
              >
                {item.label}
                {item.to === '/review' && todayCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs font-bold text-on-accent">{todayCount}</span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pb-16">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden">
        <div className="grid h-16 grid-cols-5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn('relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-accent' : 'text-muted')
              }
            >
              <Icon name={item.icon} className="size-6" />
              {item.label}
              {item.to === '/review' && <Badge count={todayCount} />}
            </NavLink>
          ))}
        </div>
      </nav>
      <ScrollRestoration />
    </div>
  )
}
