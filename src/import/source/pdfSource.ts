import { sha256Hex } from '@/lib/hash'
import { openPdf, renderPage, renderThumbnail } from '../pdf/pdf'
import type { ImportSource } from './types'

/** A PDF as an import source: one page per PDF page, with the text layer as a hint. */
export async function createPdfSource(file: File): Promise<ImportSource> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const hash = await sha256Hex(bytes)
  const doc = await openPdf(bytes.slice())
  return {
    kind: 'pdf',
    fileName: file.name,
    hash,
    pages: Array.from({ length: doc.numPages }, (_, i) => ({ label: `Page ${i + 1}` })),
    skipped: [],
    renderPage: (page, rotation) => renderPage(doc, page, rotation),
    renderThumbnail: (page, rotation) => renderThumbnail(doc, page, rotation),
    destroy: () => void doc.loadingTask.destroy(),
  }
}
