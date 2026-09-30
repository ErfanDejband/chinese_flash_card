import { describe, expect, it } from 'vitest'
import { detectKey, serviceFor } from './detectKey'

// Made-up keys with the real prefixes (not valid credentials).
describe('detectKey', () => {
  it.each([
    ['sk-ant-api03-abcdefghijklmnop', 'anthropic'],
    ['sk-or-v1-0123456789abcdef', 'openrouter'],
    ['gsk_abcdefghijklmnopqrst', 'groq'],
    ['AIzaSyA-abcdefghijklmnopqrstuv', 'gemini'],
    ['sk-proj-abcdefghijklmnop', 'openai'],
    ['sk-abcdefghijklmnopqrstuvwx', 'openai'],
    ['  AIzaSyA-abcdefghijklmnopqrstuv  ', 'gemini'],
  ])('%s → %s', (key, service) => {
    const d = detectKey(key)
    expect(d?.kind === 'service' && d.service.id).toBe(service)
  })

  it('rejects Anthropic admin keys', () => {
    expect(detectKey('sk-ant-admin01-abcdefghijk')).toMatchObject({ kind: 'unusable' })
  })

  it.each(['', 'short', 'AQ.newgooglestylekey123456', 'random-token-without-prefix'])('does not guess for %s', (key) => {
    expect(detectKey(key)).toBeNull()
  })
})

describe('serviceFor', () => {
  it('maps saved configs back to a service', () => {
    expect(serviceFor('gemini', '').id).toBe('gemini')
    expect(serviceFor('anthropic', '').id).toBe('anthropic')
    expect(serviceFor('openai-compatible', 'https://openrouter.ai/api/v1/').id).toBe('openrouter')
    expect(serviceFor('openai-compatible', 'http://localhost:1234/v1').id).toBe('custom')
  })
})
