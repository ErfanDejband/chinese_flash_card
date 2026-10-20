import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetThemeCache, applyTheme, getResolvedTheme, getThemePref, initTheme, resolveTheme, saveThemePref, subscribeTheme } from './theme'

// Minimal localStorage for Node.
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

const KEY = 'mandarin-leitner.theme'

beforeEach(() => {
  store.clear()
  _resetThemeCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveTheme', () => {
  it.each([
    ['system', false, 'light'],
    ['system', true, 'dark'],
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
  ] as const)('%s with a dark system = %s → %s', (pref, systemDark, expected) => {
    expect(resolveTheme(pref, systemDark)).toBe(expected)
  })
})

describe('theme preference', () => {
  it('follows the system on a fresh device', () => {
    expect(getThemePref()).toBe('system')
  })

  it('treats an unknown stored value as system', () => {
    store.set(KEY, 'blue')
    expect(getThemePref()).toBe('system')
  })

  it('stores the plain string and reads it back', () => {
    saveThemePref('dark')
    expect(store.get(KEY)).toBe('dark')
    _resetThemeCache()
    expect(getThemePref()).toBe('dark')
    saveThemePref('system')
    _resetThemeCache()
    expect(getThemePref()).toBe('system')
  })

  it('tells subscribers about a change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeTheme(listener)
    saveThemePref('light')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    saveThemePref('dark')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('applying the theme', () => {
  /** A document root and a window whose system theme can be flipped. */
  function fakeBrowser(systemDark: boolean) {
    const classes = new Set<string>()
    const root = {
      classList: { toggle: (name: string, force: boolean) => void (force ? classes.add(name) : classes.delete(name)) },
      style: { colorScheme: '' },
    }
    const system = { dark: systemDark }
    const mediaListeners: (() => void)[] = []
    const windowListeners: Record<string, (e: { key: string | null }) => void> = {}
    vi.stubGlobal('document', { documentElement: root })
    vi.stubGlobal('window', {
      matchMedia: () => ({
        get matches() {
          return system.dark
        },
        addEventListener: (_type: string, fn: () => void) => mediaListeners.push(fn),
      }),
      addEventListener: (type: string, fn: (e: { key: string | null }) => void) => (windowListeners[type] = fn),
    })
    return {
      classes,
      root,
      flipSystem(dark: boolean) {
        system.dark = dark
        mediaListeners.forEach((fn) => fn())
      },
      otherTabSaves(pref: string) {
        store.set(KEY, pref)
        windowListeners.storage?.({ key: KEY })
      },
    }
  }

  it('sets the dark class and color-scheme from the resolved theme', () => {
    const b = fakeBrowser(true)
    applyTheme()
    expect(getResolvedTheme()).toBe('dark')
    expect(b.classes.has('dark')).toBe(true)
    expect(b.root.style.colorScheme).toBe('dark')
    saveThemePref('light')
    expect(b.classes.has('dark')).toBe(false)
    expect(b.root.style.colorScheme).toBe('light')
  })

  it('follows system changes only while the preference is system', () => {
    const b = fakeBrowser(false)
    initTheme()
    const listener = vi.fn()
    const unsubscribe = subscribeTheme(listener)
    expect(b.classes.has('dark')).toBe(false)

    b.flipSystem(true)
    expect(b.classes.has('dark')).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)

    saveThemePref('light')
    b.flipSystem(false)
    b.flipSystem(true)
    expect(b.classes.has('dark')).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2) // only the save
    unsubscribe()
  })

  it('picks up a change made in another tab', () => {
    const b = fakeBrowser(false)
    initTheme()
    expect(getThemePref()).toBe('system')
    b.otherTabSaves('dark')
    expect(getThemePref()).toBe('dark')
    expect(b.classes.has('dark')).toBe(true)
  })
})
