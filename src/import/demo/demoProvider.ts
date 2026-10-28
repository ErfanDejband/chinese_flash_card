import { defaultSleep } from '../ai/retry'
import type { VisionProvider } from '../ai/types'
import { sampleReply } from './samplePage'

export const DEMO_MODEL = 'sample'

/** Steps of the pretend reply: the thinking count rises, then the answer arrives in pieces. */
const THINKING_STEPS = 6
const WRITING_PIECES = 16

/**
 * Stands in for the AI in the import demo: it answers with the sample page's items. When the
 * caller follows progress, it acts like a streaming model (about `delayMs` of "thinking" with a
 * rising token count, then the reply in pieces over `writeMs`); otherwise it just waits `delayMs`.
 */
export function createDemoProvider(delayMs = 1500, writeMs = delayMs > 0 ? 2000 : 0): VisionProvider {
  return {
    label: 'Sample page (no AI)',
    listModels: async () => [],
    async extractPage({ signal, onProgress }) {
      const reply = sampleReply()
      if (!onProgress) {
        await defaultSleep(delayMs, signal)
        return { text: reply, model: DEMO_MODEL }
      }
      onProgress({ phase: 'thinking', text: '' })
      for (let i = 1; i <= THINKING_STEPS; i++) {
        await defaultSleep(delayMs / THINKING_STEPS, signal)
        onProgress({ phase: 'thinking', reasoningTokens: i * 180, text: '' })
      }
      for (let i = 1; i <= WRITING_PIECES; i++) {
        await defaultSleep(writeMs / WRITING_PIECES, signal)
        onProgress({ phase: 'writing', reasoningTokens: THINKING_STEPS * 180, text: reply.slice(0, Math.ceil((reply.length * i) / WRITING_PIECES)) })
      }
      return { text: reply, model: DEMO_MODEL }
    },
  }
}
