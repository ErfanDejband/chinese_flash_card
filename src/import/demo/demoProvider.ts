import type { VisionProvider } from '../ai/types'
import { sampleReply } from './samplePage'

export const DEMO_MODEL = 'sample'

/** Stands in for the AI in the import demo: after a short pause, it answers with the sample page's items. */
export function createDemoProvider(delayMs = 1500): VisionProvider {
  return {
    label: 'Sample page (no AI)',
    listModels: async () => [],
    async extractPage({ signal }) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs)
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
          },
          { once: true },
        )
      })
      return { text: sampleReply(), model: DEMO_MODEL }
    },
  }
}
