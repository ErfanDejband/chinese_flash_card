/**
 * Claude API list prices in USD per million tokens (Anthropic first-party rates, cached
 * 2026-06-24). Used only to *estimate* the cost shown in Settings; the Anthropic Console
 * has the authoritative bill. Update when prices change.
 */
export const CLAUDE_PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

/** Estimated USD for a Claude request, or undefined for unknown models. */
export function estimateClaudeCostUsd(model: string, inputTokens: number, outputTokens: number): number | undefined {
  const price = CLAUDE_PRICES_PER_MTOK[model]
  if (!price) return undefined
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000
}
