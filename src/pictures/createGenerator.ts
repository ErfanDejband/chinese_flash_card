import type { FetchLike } from '@/import/ai/types'
import { createGeminiGenerator } from './generators/gemini'
import { createOpenAIGenerator } from './generators/openai'
import { createOpenRouterGenerator } from './generators/openrouter'
import type { PictureGenerator, PictureService } from './types'

export const SERVICE_LABEL: Record<PictureService, string> = { openrouter: 'OpenRouter', openai: 'OpenAI', gemini: 'Google Gemini' }

export function createGenerator(setup: { service: PictureService; apiKey: string; model: string }, fetchImpl?: FetchLike): PictureGenerator {
  switch (setup.service) {
    case 'openrouter':
      return createOpenRouterGenerator({ apiKey: setup.apiKey, model: setup.model, fetchImpl })
    case 'openai':
      return createOpenAIGenerator({ apiKey: setup.apiKey, model: setup.model, fetchImpl })
    case 'gemini':
      return createGeminiGenerator({ apiKey: setup.apiKey, model: setup.model, fetchImpl })
  }
}

/** What is missing before pictures can be made. */
export function pictureSetupProblems(setup: { service: PictureService; apiKey: string; model: string }): string[] {
  const problems: string[] = []
  if (!setup.apiKey) problems.push(`Add a ${SERVICE_LABEL[setup.service]} key for pictures.`)
  if (!setup.model) problems.push('Choose a picture model.')
  return problems
}
