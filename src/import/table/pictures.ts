/**
 * Pictures in word lists. A picture column holds, per row, either a picture from the Excel file
 * itself (the reader puts a marker like `⟦picture 3⟧` in its cell) or an image file name
 * (`apple.jpg`) matched to files chosen with the list.
 */

/** Stands in a cell for the workbook's picture `index` (0-based), so it survives parsing like text. */
export const pictureMarker = (index: number) => `⟦picture ${index + 1}⟧`

/** The workbook picture a cell's marker stands for. */
export function markerIndex(text: string): number | undefined {
  const m = /^⟦picture (\d+)⟧$/.exec(text.trim())
  return m ? Number(m[1]) - 1 : undefined
}

const IMAGE_FILE = /\.(jpe?g|png|gif|webp|bmp|avif|heic|heif|svg)$/i

/** A cell that names a picture: a workbook marker or an image file name. */
export const isPictureRef = (cell: string) => markerIndex(cell) !== undefined || IMAGE_FILE.test(cell.trim())

/** A chosen file that is a picture rather than the list itself. */
export const isImageFile = (file: { name: string; type: string }) => file.type.startsWith('image/') || IMAGE_FILE.test(file.name)

/** `Pictures/Apple.JPG` → `apple.jpg`: what a file name is matched by. */
export const fileKey = (name: string) => (name.split(/[\\/]/).pop() ?? '').normalize('NFC').trim().toLowerCase()

const withoutExtension = (key: string) => key.replace(/\.[^.]*$/, '')

/**
 * The chosen file a cell names: the same file name (any folder, any case), else the same name
 * without its extension (`apple` finds `apple.png`).
 */
export function findPictureFile<T extends { name: string }>(ref: string, files: readonly T[]): T | undefined {
  const key = fileKey(ref)
  if (!key) return undefined
  return files.find((f) => fileKey(f.name) === key) ?? files.find((f) => withoutExtension(fileKey(f.name)) === withoutExtension(key))
}
