import { createImageSource } from './imageSource'
import { createPdfSource } from './pdfSource'
import { classifyFiles } from './pickFiles'
import type { ImportSource } from './types'

export class SourceError extends Error {}

/** Open what the user picked (one PDF, or one or more images) as an import source. */
export async function openSource(files: File[]): Promise<ImportSource> {
  const choice = classifyFiles(files)
  if (choice.kind === 'error') throw new SourceError(choice.message)
  try {
    return choice.kind === 'pdf' ? await createPdfSource(choice.file) : await createImageSource(choice.files)
  } catch (e) {
    if (choice.kind === 'pdf') throw new SourceError('Could not open that file as a PDF.')
    throw new SourceError(e instanceof Error ? e.message : 'Could not read the images.')
  }
}
