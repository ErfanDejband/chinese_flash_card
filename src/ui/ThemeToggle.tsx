import { useResolvedTheme } from '@/hooks/useBrowser'
import { saveThemePref } from '@/lib/theme'
import { cn } from './cn'
import { Icon } from './icons'

/** Quick light / dark switch for a page header. Saves an explicit choice; Settings → Appearance also offers System. */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useResolvedTheme() === 'dark'
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <button
      type="button"
      onClick={() => saveThemePref(dark ? 'light' : 'dark')}
      className={cn('grid size-10 place-items-center rounded-full text-muted hover:bg-sunken', className)}
      aria-label={label}
      title={label}
    >
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  )
}
