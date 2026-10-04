import type { RenderedPage } from '../extract/runExtraction'
import type { Rotation } from '../render'

export interface SourcePage {
  /** Shown in the picker and review: "Page 5", "IMG_1234.jpg", "scroll.png (part 2/4)". */
  label: string
  /** Original file name, for image sources (provenance on the card). */
  sourceFile?: string
}

/**
 * Something the importer can turn into page images: one PDF, or one or more images. Pages are
 * numbered from 1. Everything after rendering (AI, checks, crops, review) is source-agnostic.
 */
export interface ImportSource {
  kind: 'pdf' | 'images'
  /** "book.pdf" or "IMG_1.jpg + 4 more". */
  fileName: string
  /** Content hash, independent of the order the files were picked in ('' if unavailable). */
  hash: string
  pages: SourcePage[]
  /** Files that could not be read (e.g. HEIC on desktop Chrome), with the reason. */
  skipped: string[]
  renderPage(page: number, rotation: Rotation): Promise<RenderedPage>
  renderThumbnail(page: number, rotation: Rotation): Promise<Blob>
  destroy(): void
}
