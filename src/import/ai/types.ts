import type { JsonTask } from './prompt'

export type ProviderKind = 'gemini' | 'anthropic' | 'openai-compatible'

/** Per-device AI settings. Stored in localStorage only (never in backups). */
export interface ProviderConfig {
  provider: ProviderKind
  apiKey: string
  model: string
  /** OpenAI-compatible endpoint root, e.g. https://openrouter.ai/api/v1 */
  baseUrl: string
}

/** Tokens of one request, and its cost when the provider reports it or it can be estimated. */
export interface RequestUsage {
  inputTokens: number
  outputTokens: number
  costUsd?: number
  costSource?: 'reported' | 'estimated'
}

export interface ModelInfo {
  id: string
  label: string
  /** Accepts image input; undefined when the provider does not say. */
  vision?: boolean
  free?: boolean
}

export interface PageRequest {
  /** Base64 page image (no data: prefix). Omitted for text-only requests. */
  imageBase64?: string
  mime?: string
  textHint: string
  /** What to ask for; the vocabulary prompt by default. */
  task?: JsonTask
  signal?: AbortSignal
}

/** What the service said about one request, for the import trace (lib/importTrace). */
export interface ResponseMeta {
  /** The service's id for the request; on OpenRouter, the generation id behind its stats. */
  id?: string
  /** The provider that served the request (OpenRouter routes each one to a provider). */
  provider?: string
  reasoningTokens?: number
  finishReason?: string
  /** JSON mode was rejected, so the request was sent a second time without it. */
  jsonFallback?: boolean
}

export interface PageResponse {
  /** Raw model text (expected to be JSON). */
  text: string
  model: string
  usage?: RequestUsage
  meta?: ResponseMeta
}

export interface VisionProvider {
  readonly label: string
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>
  extractPage(request: PageRequest): Promise<PageResponse>
}

/** `quota`: a daily limit is used up; unlike `rate-limit`, waiting a few minutes won't help. */
export type ProviderErrorKind = 'auth' | 'rate-limit' | 'quota' | 'bad-request' | 'server' | 'network' | 'blocked' | 'bad-response'

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind
  readonly status?: number
  readonly retryAfterMs?: number

  constructor(kind: ProviderErrorKind, message: string, opts: { status?: number; retryAfterMs?: number } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.kind = kind
    this.status = opts.status
    this.retryAfterMs = opts.retryAfterMs
  }

  /** Worth retrying automatically. */
  get transient(): boolean {
    return this.kind === 'rate-limit' || this.kind === 'server' || this.kind === 'network'
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
