import { sha256Hex } from '@/lib/hash'
import type { RenderedPage } from '../extract/runExtraction'
import { canvasToBlob, downscale, drawRegion, type Region, type Rotation } from '../render'
import { combinedHash, describeFiles } from './pickFiles'
import { planTiles } from './tiles'
import type { ImportSource, SourcePage } from './types'

interface ImagePage extends SourcePage {
  file: File
  region: Region
}

/**
 * Photos and screenshots as an import source. Files arrive sorted by name; each becomes one page,
 * or several overlapping tiles when it is a very long screenshot. `createImageBitmap` applies the
 * camera's EXIF rotation; the user's extra rotation comes from the page picker.
 */
export async function createImageSource(files: File[]): Promise<ImportSource> {
  const pages: ImagePage[] = []
  const skipped: string[] = []
  const hashes: string[] = []

  for (const file of files) {
    let width: number
    let height: number
    try {
      const bitmap = await createImageBitmap(file)
      width = bitmap.width
      height = bitmap.height
      bitmap.close()
    } catch {
      skipped.push(`${file.name}: this browser can't read the image format${/\.hei[cf]$/i.test(file.name) ? ' (HEIC — export it as JPEG)' : ''}.`)
      continue
    }
    hashes.push(await sha256Hex(new Uint8Array(await file.arrayBuffer())))
    const tiles = planTiles(width, height)
    tiles.forEach((region, i) =>
      pages.push({
        file,
        region,
        sourceFile: file.name,
        label: tiles.length > 1 ? `${file.name} (part ${i + 1}/${tiles.length})` : file.name,
      }),
    )
  }
  if (pages.length === 0) throw new Error(skipped.join(' ') || 'No readable images.')

  const usedFiles = [...new Set(pages.map((p) => p.file))]
  const pageAt = (n: number) => {
    const page = pages[n - 1]
    if (!page) throw new Error(`No page ${n}`)
    return page
  }

  async function draw(n: number, rotation: Rotation, longSide: number): Promise<HTMLCanvasElement> {
    const page = pageAt(n)
    const bitmap = await createImageBitmap(page.file)
    try {
      return drawRegion(bitmap, page.region, rotation, longSide)
    } finally {
      bitmap.close()
    }
  }

  return {
    kind: 'images',
    fileName: describeFiles(usedFiles.map((f) => f.name)),
    hash: await combinedHash(hashes),
    pages: pages.map(({ label, sourceFile }) => ({ label, sourceFile })),
    skipped,
    async renderPage(n, rotation): Promise<RenderedPage> {
      const { region } = pageAt(n)
      const full = await draw(n, rotation, 1920)
      const [image, aiImage] = await Promise.all([
        canvasToBlob(full, 'image/jpeg', 0.9),
        canvasToBlob(downscale(full, 1536), 'image/jpeg', 0.85),
      ])
      const sideways = rotation === 90 || rotation === 270
      return {
        page: n,
        image,
        width: full.width,
        height: full.height,
        // Provenance boxes are in the source image's pixels.
        pointWidth: sideways ? region.height : region.width,
        pointHeight: sideways ? region.width : region.height,
        aiImage,
        textHint: '',
      }
    },
    async renderThumbnail(n, rotation) {
      return canvasToBlob(await draw(n, rotation, 320), 'image/jpeg', 0.75)
    },
    destroy() {},
  }
}
