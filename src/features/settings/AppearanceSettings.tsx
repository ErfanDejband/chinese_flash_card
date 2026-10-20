import { useThemePref } from '@/hooks/useBrowser'
import { saveThemePref, THEME_PREFS, type ThemePref } from '@/lib/theme'
import { cn } from '@/ui/cn'
import { Icon, type IconName } from '@/ui/icons'

const OPTIONS: Record<ThemePref, { label: string; icon: IconName }> = {
  system: { label: 'System', icon: 'contrast' },
  light: { label: 'Light', icon: 'sun' },
  dark: { label: 'Dark', icon: 'moon' },
}

/** Light or dark screens; System follows the device. Kept on this device only. */
export function AppearanceSettings() {
  const pref = useThemePref()
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Appearance">
        {THEME_PREFS.map((option) => {
          const { label, icon } = OPTIONS[option]
          const active = pref === option
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => saveThemePref(option)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border p-3 font-semibold',
                active ? 'border-accent bg-accent/10' : 'border-line bg-paper',
              )}
            >
              <Icon name={icon} className={cn('size-5', active ? 'text-accent' : 'text-muted')} />
              {label}
            </button>
          )
        })}
      </div>
      <p className="text-sm text-muted">System follows your device’s light or dark setting. Saved on this device.</p>
    </div>
  )
}
