import { beforeEach, describe, expect, it } from 'vitest'
import { _resetAiSettingsCache, activeProviderConfig, DEFAULT_AI_SETTINGS, getAiSettings, saveAiSettings } from './aiConfig'

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

const stored = (value: unknown) => store.set('mandarin-leitner.ai', JSON.stringify(value))

beforeEach(() => {
  store.clear()
  _resetAiSettingsCache()
})

describe('AI settings', () => {
  it('starts in free mode on a fresh device', () => {
    expect(getAiSettings()).toEqual(DEFAULT_AI_SETTINGS)
    expect(getAiSettings().mode).toBe('free')
  })

  it('keeps an existing own-key setup active after the update', () => {
    stored({ provider: 'gemini', gemini: { apiKey: 'AIza-made-up', model: 'gemini-3.8-flash' } })
    expect(getAiSettings()).toMatchObject({ mode: 'own-key', free: { apiKey: '' }, gemini: { apiKey: 'AIza-made-up' } })
  })

  it('treats a key-less local server setup as own-key too', () => {
    stored({ provider: 'openai-compatible', openai: { baseUrl: 'http://localhost:1234/v1', apiKey: '', model: 'llava' } })
    expect(getAiSettings().mode).toBe('own-key')
  })

  it('a stored mode wins, and switching keeps both setups', () => {
    stored({ mode: 'free', free: { apiKey: 'sk-or-v1-made-up' }, provider: 'anthropic', anthropic: { apiKey: 'sk-ant-made-up', model: 'claude-opus-5' } })
    const s = getAiSettings()
    expect(s.mode).toBe('free')
    saveAiSettings({ ...s, mode: 'own-key' })
    _resetAiSettingsCache()
    expect(getAiSettings()).toMatchObject({ mode: 'own-key', free: { apiKey: 'sk-or-v1-made-up' }, anthropic: { apiKey: 'sk-ant-made-up' } })
  })

  it('free mode uses the OpenRouter free router with the signed-in key', () => {
    const s = { ...DEFAULT_AI_SETTINGS, free: { apiKey: ' sk-or-v1-made-up ' }, gemini: { apiKey: 'AIza-made-up', model: 'g' } }
    expect(activeProviderConfig(s)).toEqual({
      provider: 'openai-compatible',
      apiKey: 'sk-or-v1-made-up',
      model: 'openrouter/free',
      baseUrl: 'https://openrouter.ai/api/v1',
    })
    expect(activeProviderConfig({ ...s, mode: 'own-key' })).toMatchObject({ provider: 'gemini', apiKey: 'AIza-made-up' })
  })
})
