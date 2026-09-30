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
  /** Base64 page image (no data: prefix). */
  imageBase64: string
  mime: string
  textHint: string
  signal?: AbortSignal
}

export interface PageResponse {
  /** Raw model text (expected to be JSON). */
  text: string
  model: string
  usage?: RequestUsage
}

export interface VisionProvider {
  readonly label: string
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>
  extractPage(request: PageRequest): Promise<PageResponse>
}

export type ProviderErrorKind = 'auth' | 'rate-limit' | 'bad-request' | 'server' | 'network' | 'blocked' | 'bad-response'

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
