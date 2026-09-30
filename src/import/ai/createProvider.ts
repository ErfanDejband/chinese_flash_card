import { createAnthropicProvider } from './anthropic'
import { createGeminiProvider } from './gemini'
import { createOpenAICompatibleProvider } from './openaiCompatible'
import type { FetchLike, ProviderConfig, VisionProvider } from './types'

export function createProvider(config: ProviderConfig, fetchImpl?: FetchLike): VisionProvider {
  switch (config.provider) {
    case 'gemini':
      return createGeminiProvider({ apiKey: config.apiKey, model: config.model, fetchImpl })
    case 'anthropic':
      return createAnthropicProvider({ apiKey: config.apiKey, model: config.model, fetchImpl })
    case 'openai-compatible':
      return createOpenAICompatibleProvider({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, fetchImpl })
  }
}

/** Missing pieces that prevent an import from starting. */
export function configProblems(config: ProviderConfig): string[] {
  const problems: string[] = []
  if (config.provider === 'openai-compatible' && !/^https?:\/\//.test(config.baseUrl)) problems.push('Set the API base URL.')
  // Local servers (LM Studio, Ollama) often need no key.
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(config.baseUrl)
  if (!config.apiKey && !(config.provider === 'openai-compatible' && local)) problems.push('Add your API key.')
  if (!config.model) problems.push('Choose a model.')
  return problems
}
