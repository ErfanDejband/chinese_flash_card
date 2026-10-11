import { FREE_ROUTER_MODEL, OPENROUTER_BASE_URL } from '@/import/ai/openrouterAuth'
import type { ProviderConfig, ProviderKind } from '@/import/ai/types'
import { DEFAULT_SHEET_SIZE, SHEET_SIZES, type SheetSize } from '@/pictures/sheet'
import { DEFAULT_STYLE, PICTURE_STYLES, type PictureStyleId } from '@/pictures/styles'
import type { PictureService } from '@/pictures/types'

/**
 * AI provider settings live in localStorage on this device only: they are never part of
 * backups, and each key is only sent to its own provider.
 */
export interface AiSettingsState {
  /**
   * `free`: OpenRouter's free models, with a key from "Sign in with OpenRouter".
   * `own-key`: a pasted key for the provider below. Switching keeps both setups.
   */
  mode: AiMode
  free: { apiKey: string }
  provider: ProviderKind
  gemini: { apiKey: string; model: string }
  anthropic: { apiKey: string; model: string }
  openai: { baseUrl: string; apiKey: string; model: string }
  /** Making pictures for cards: a separate image model, often a separate service. */
  pictures: PictureSettings
}

export interface PictureSettings {
  service: PictureService
  models: Record<PictureService, string>
  /** Keys entered for pictures only; empty means reuse this device's import key for that service, if any. */
  keys: Record<PictureService, string>
  style: PictureStyleId
  perSheet: SheetSize
}

export type AiMode = 'free' | 'own-key'

const STORAGE_KEY = 'mandarin-leitner.ai'

export const DEFAULT_AI_SETTINGS: AiSettingsState = {
  mode: 'free',
  free: { apiKey: '' },
  provider: 'gemini',
  gemini: { apiKey: '', model: '' },
  anthropic: { apiKey: '', model: '' },
  openai: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', model: '' },
  pictures: {
    service: 'openrouter',
    models: { openrouter: 'openai/gpt-image-1-mini', openai: 'gpt-image-1-mini', gemini: 'gemini-3.1-flash-lite-image' },
    keys: { openrouter: '', openai: '', gemini: '' },
    style: DEFAULT_STYLE,
    perSheet: DEFAULT_SHEET_SIZE,
  },
}

const PICTURE_SERVICES: PictureService[] = ['openrouter', 'openai', 'gemini']

function parsePictures(p: Partial<PictureSettings> | undefined): PictureSettings {
  const d = DEFAULT_AI_SETTINGS.pictures
  return {
    service: p?.service && PICTURE_SERVICES.includes(p.service) ? p.service : d.service,
    models: { ...d.models, ...p?.models },
    keys: { ...d.keys, ...p?.keys },
    style: PICTURE_STYLES.some((s) => s.id === p?.style) ? p!.style! : d.style,
    perSheet: SHEET_SIZES.includes(p?.perSheet as SheetSize) ? p!.perSheet! : d.perSheet,
  }
}

let cache: AiSettingsState | undefined
const listeners = new Set<() => void>()

const PROVIDERS: ProviderKind[] = ['gemini', 'anthropic', 'openai-compatible']

function parse(stored: Partial<AiSettingsState> | null): AiSettingsState {
  const own = [stored?.gemini, stored?.anthropic, stored?.openai]
  // Settings saved before the free mode existed: keep a configured own-key setup active.
  const hasOwnSetup = own.some((s) => s?.apiKey?.trim() || s?.model?.trim())
  return {
    mode: stored?.mode === 'free' || stored?.mode === 'own-key' ? stored.mode : hasOwnSetup ? 'own-key' : 'free',
    free: { ...DEFAULT_AI_SETTINGS.free, ...stored?.free },
    provider: stored?.provider && PROVIDERS.includes(stored.provider) ? stored.provider : 'gemini',
    gemini: { ...DEFAULT_AI_SETTINGS.gemini, ...stored?.gemini },
    anthropic: { ...DEFAULT_AI_SETTINGS.anthropic, ...stored?.anthropic },
    openai: { ...DEFAULT_AI_SETTINGS.openai, ...stored?.openai },
    pictures: parsePictures(stored?.pictures),
  }
}

export function getAiSettings(): AiSettingsState {
  if (!cache) {
    try {
      cache = parse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<AiSettingsState> | null)
    } catch {
      cache = DEFAULT_AI_SETTINGS
    }
  }
  return cache
}

export function saveAiSettings(next: AiSettingsState): void {
  cache = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable (private mode): settings last for this session only.
  }
  listeners.forEach((l) => l())
}

export function subscribeAiSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Another tab or window of the app changed the settings, e.g. the OpenRouter sign-in returned
// in a browser tab instead of the installed app.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return
    cache = undefined
    listeners.forEach((l) => l())
  })
}

/** Forget the cached settings (tests). */
export function _resetAiSettingsCache(): void {
  cache = undefined
}

export function activeProviderConfig(s: AiSettingsState): ProviderConfig {
  if (s.mode === 'free') {
    return { provider: 'openai-compatible', apiKey: s.free.apiKey.trim(), model: FREE_ROUTER_MODEL, baseUrl: OPENROUTER_BASE_URL }
  }
  switch (s.provider) {
    case 'gemini':
      return { provider: 'gemini', apiKey: s.gemini.apiKey.trim(), model: s.gemini.model.trim(), baseUrl: '' }
    case 'anthropic':
      return { provider: 'anthropic', apiKey: s.anthropic.apiKey.trim(), model: s.anthropic.model.trim(), baseUrl: '' }
    case 'openai-compatible':
      return { provider: 'openai-compatible', apiKey: s.openai.apiKey.trim(), model: s.openai.model.trim(), baseUrl: s.openai.baseUrl.trim() }
  }
}

/** The image service, model and key pictures are made with. */
export interface PictureSetup {
  service: PictureService
  model: string
  apiKey: string
  /** Where the key comes from: entered for pictures, or reused from the import setup. */
  keyFrom: 'pictures' | 'import' | 'free-sign-in' | 'none'
}

export function pictureSetup(s: AiSettingsState): PictureSetup {
  const { service, models, keys } = s.pictures
  const own = keys[service].trim()
  const model = models[service].trim()
  if (own) return { service, model, apiKey: own, keyFrom: 'pictures' }
  const importKey =
    service === 'gemini'
      ? s.gemini.apiKey.trim()
      : s.openai.baseUrl.includes(service === 'openai' ? 'api.openai.com' : 'openrouter.ai')
        ? s.openai.apiKey.trim()
        : ''
  if (importKey) return { service, model, apiKey: importKey, keyFrom: 'import' }
  if (service === 'openrouter' && s.free.apiKey.trim()) return { service, model, apiKey: s.free.apiKey.trim(), keyFrom: 'free-sign-in' }
  return { service, model, apiKey: '', keyFrom: 'none' }
}
