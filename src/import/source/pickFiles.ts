import { sha256Hex } from '@/lib/hash'

export interface PickedFile {
  name: string
  type: string
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i

export const isPdf = (f: PickedFile) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
export const isImage = (f: PickedFile) => f.type.startsWith('image/') || IMAGE_EXT.test(f.name)

export type FileChoice<T> = { kind: 'pdf'; file: T } | { kind: 'images'; files: T[] } | { kind: 'error'; message: string }

/**
 * What the user picked: exactly one PDF, or one or more images (sorted by name, so phone photos
 * stay in the order they were taken). Anything else is explained.
 */
export function classifyFiles<T extends PickedFile>(files: T[]): FileChoice<T> {
  if (files.length === 0) return { kind: 'error', message: 'No file chosen.' }
  const other = files.find((f) => !isPdf(f) && !isImage(f))
  if (other) return { kind: 'error', message: `${other.name} is not a PDF or an image.` }
  const pdfs = files.filter(isPdf)
  if (pdfs.length > 0) {
    if (files.length > 1) return { kind: 'error', message: 'Choose one PDF on its own, or one or more images.' }
    return { kind: 'pdf', file: pdfs[0]! }
  }
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  return { kind: 'images', files: sorted }
}

/** One hash for a set of files, independent of the order they were picked in. */
export async function combinedHash(fileHashes: string[]): Promise<string> {
  if (fileHashes.some((h) => !h)) return ''
  if (fileHashes.length === 1) return fileHashes[0]!
  return sha256Hex(new TextEncoder().encode([...fileHashes].sort().join('\n')))
}

/** "IMG_1.jpg" or "IMG_1.jpg + 4 more". */
export function describeFiles(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names[0]} + ${names.length - 1} more`
}
