import type { ModelInfo, RequestUsage } from '@/import/ai/types'

/** Paid services that can draw pictures with the user's own key (or OpenRouter credit). */
export type PictureService = 'openrouter' | 'openai' | 'gemini'

export type PictureQuality = 'low' | 'medium'

/** Only the two shapes every image model supports. */
export type SheetAspect = '1:1' | '3:2'

export interface SheetRequest {
  prompt: string
  aspect: SheetAspect
  /** Used by models with a quality setting (OpenAI's); others ignore it. */
  quality: PictureQuality
  signal?: AbortSignal
}

export interface SheetResult {
  image: Blob
  model: string
  usage?: RequestUsage
}

/** An image model behind one service. */
export interface PictureGenerator {
  readonly label: string
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>
  generate(request: SheetRequest): Promise<SheetResult>
}

/** What the planning call says about one word. */
export interface PicturePlan {
  /** A picture can show the meaning (not 很, 因為, 的). */
  picturable: boolean
  /** A concrete description of one picture, in English. */
  scene: string
  /** The best single emoji, or ''. */
  emoji: string
  /** A few English words to find a photo (Phase 12). */
  searchQuery: string
}
