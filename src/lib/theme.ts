/**
 * Light / dark appearance of this device: follow the system, or always light or dark.
 * Kept in localStorage as the plain string (never synced or backed up). The inline script in
 * index.html and the static About / Privacy pages read the same key before the first paint.
 */
export type ThemePref = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export const THEME_PREFS: readonly ThemePref[] = ['system', 'light', 'dark']

const STORAGE_KEY = 'mandarin-leitner.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

let cache: ThemePref | undefined
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function isThemePref(value: unknown): value is ThemePref {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function getThemePref(): ThemePref {
  if (cache === undefined) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      cache = isThemePref(stored) ? stored : 'system'
    } catch {
      cache = 'system'
    }
  }
  return cache
}

export function saveThemePref(pref: ThemePref): void {
  cache = pref
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // Storage unavailable: lasts for this session only.
  }
  applyTheme()
  notify()
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref !== 'system') return pref
  return systemDark ? 'dark' : 'light'
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
}

/** The theme on screen now. */
export function getResolvedTheme(): Theme {
  return resolveTheme(getThemePref(), systemPrefersDark())
}

/** Sets the `dark` class (Tailwind's `dark:` variant and the dark tokens in index.css) and `color-scheme`. */
export function applyTheme(): void {
  if (typeof document === 'undefined') return
  const dark = getResolvedTheme() === 'dark'
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
}

let initialized = false

/** Applies the theme and keeps it current. Called once from main.tsx, before the first render. */
export function initTheme(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  applyTheme()
  // The system switched between light and dark (e.g. Android's schedule).
  if (typeof window.matchMedia === 'function') {
    window.matchMedia(DARK_QUERY).addEventListener('change', () => {
      if (getThemePref() !== 'system') return
      applyTheme()
      notify()
    })
  }
  // Another tab or window of the app changed the setting.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return
    cache = undefined
    applyTheme()
    notify()
  })
}

/** Forget the cached preference and the init (tests). */
export function _resetThemeCache(): void {
  cache = undefined
  initialized = false
}
