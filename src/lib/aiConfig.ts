import type { ProviderConfig, ProviderKind } from '@/import/ai/types'

/**
 * AI provider settings live in localStorage on this device only: they are never part of
 * backups, and each key is only sent to its own provider.
 */
export interface AiSettingsState {
  provider: ProviderKind
  gemini: { apiKey: string; model: string }
  anthropic: { apiKey: string; model: string }
  openai: { baseUrl: string; apiKey: string; model: string }
}

const STORAGE_KEY = 'mandarin-leitner.ai'

export const DEFAULT_AI_SETTINGS: AiSettingsState = {
  provider: 'gemini',
  gemini: { apiKey: '', model: '' },
  anthropic: { apiKey: '', model: '' },
  openai: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', model: '' },
}

let cache: AiSettingsState | undefined
const listeners = new Set<() => void>()

const PROVIDERS: ProviderKind[] = ['gemini', 'anthropic', 'openai-compatible']

export function getAiSettings(): AiSettingsState {
  if (!cache) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<AiSettingsState> | null
      cache = {
        provider: stored?.provider && PROVIDERS.includes(stored.provider) ? stored.provider : 'gemini',
        gemini: { ...DEFAULT_AI_SETTINGS.gemini, ...stored?.gemini },
        anthropic: { ...DEFAULT_AI_SETTINGS.anthropic, ...stored?.anthropic },
        openai: { ...DEFAULT_AI_SETTINGS.openai, ...stored?.openai },
      }
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

export function activeProviderConfig(s: AiSettingsState): ProviderConfig {
  switch (s.provider) {
    case 'gemini':
      return { provider: 'gemini', apiKey: s.gemini.apiKey.trim(), model: s.gemini.model.trim(), baseUrl: '' }
    case 'anthropic':
      return { provider: 'anthropic', apiKey: s.anthropic.apiKey.trim(), model: s.anthropic.model.trim(), baseUrl: '' }
    case 'openai-compatible':
      return { provider: 'openai-compatible', apiKey: s.openai.apiKey.trim(), model: s.openai.model.trim(), baseUrl: s.openai.baseUrl.trim() }
  }
}
