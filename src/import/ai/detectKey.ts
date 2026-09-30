import type { ProviderKind } from './types'

export type ServiceId = 'gemini' | 'anthropic' | 'openrouter' | 'groq' | 'openai' | 'custom'

export interface Service {
  id: ServiceId
  provider: ProviderKind
  label: string
  /** Endpoint root for OpenAI-compatible services. */
  baseUrl?: string
  keyUrl?: string
}

export const SERVICES: Record<ServiceId, Service> = {
  gemini: { id: 'gemini', provider: 'gemini', label: 'Google Gemini (AI Studio)', keyUrl: 'https://aistudio.google.com/apikey' },
  anthropic: { id: 'anthropic', provider: 'anthropic', label: 'Claude (Anthropic API)', keyUrl: 'https://console.anthropic.com/settings/keys' },
  openrouter: { id: 'openrouter', provider: 'openai-compatible', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys' },
  groq: { id: 'groq', provider: 'openai-compatible', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys' },
  openai: { id: 'openai', provider: 'openai-compatible', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
  custom: { id: 'custom', provider: 'openai-compatible', label: 'Other OpenAI-compatible (LM Studio, Ollama…)' },
}

export type KeyDetection =
  | { kind: 'service'; service: Service }
  /** Recognised, but cannot be used for extraction. */
  | { kind: 'unusable'; reason: string }

/**
 * Identify the service from the key's format only. Keys are never "tried" against other
 * services: that would send them to companies that don't own them. Order matters
 * (`sk-ant-` and `sk-or-` before the generic OpenAI `sk-`).
 */
export function detectKey(rawKey: string): KeyDetection | null {
  const key = rawKey.trim()
  if (key.length < 10) return null
  if (key.startsWith('sk-ant-admin')) {
    return { kind: 'unusable', reason: 'This is an Anthropic Admin key. Create a regular API key in the Claude Console instead.' }
  }
  if (key.startsWith('sk-ant-')) return { kind: 'service', service: SERVICES.anthropic }
  if (key.startsWith('sk-or-')) return { kind: 'service', service: SERVICES.openrouter }
  if (key.startsWith('gsk_')) return { kind: 'service', service: SERVICES.groq }
  if (key.startsWith('AIza')) return { kind: 'service', service: SERVICES.gemini }
  if (key.startsWith('sk-')) return { kind: 'service', service: SERVICES.openai }
  return null
}

/** The service a saved configuration corresponds to. */
export function serviceFor(provider: ProviderKind, baseUrl: string): Service {
  if (provider === 'gemini') return SERVICES.gemini
  if (provider === 'anthropic') return SERVICES.anthropic
  const base = baseUrl.replace(/\/+$/, '')
  return Object.values(SERVICES).find((s) => s.baseUrl === base) ?? SERVICES.custom
}
