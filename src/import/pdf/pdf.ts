import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import type { RenderedPage } from '../extract/runExtraction'

type PdfJs = typeof import('pdfjs-dist')

let pdfjsPromise: Promise<PdfJs> | undefined

/** pdf.js is loaded on demand: it is large and only the import screens need it. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib
    },
  )
  return pdfjsPromise
}

/** Opens a PDF. pdf.js takes ownership of (detaches) the buffer, so pass a copy if you still need it. */
export async function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const lib = await loadPdfJs()
  return lib.getDocument({ data }).promise
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the page image'))), type, quality),
  )
}

async function drawPage(page: PDFPageProxy, longSide: number): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: longSide / Math.max(base.width, base.height) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  // 'print' intent: pdf.js then doesn't wait on requestAnimationFrame, which never fires in a
  // background tab. Extraction keeps going when the user switches tabs.
  await page.render({ canvas, viewport, background: '#ffffff', intent: 'print' }).promise
  return canvas
}

function downscale(source: HTMLCanvasElement, longSide: number): HTMLCanvasElement {
  const scale = Math.min(1, longSide / Math.max(source.width, source.height))
  if (scale === 1) return source
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

const MAX_HINT_CHARS = 3000

/** Text layer as plain lines: a cheap, exact hint for the model when the PDF has real text. */
async function textHint(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent()
  let text = ''
  for (const item of content.items) {
    if (!('str' in item)) continue
    const t = item as TextItem
    text += t.str + (t.hasEOL ? '\n' : ' ')
  }
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_HINT_CHARS)
}

/** Render one page for extraction: ~1920 px image for crops, ~1536 px JPEG for the model, plus the text hint. */
export async function renderPage(doc: PDFDocumentProxy, pageNumber: number): Promise<RenderedPage> {
  const page = await doc.getPage(pageNumber)
  try {
    const base = page.getViewport({ scale: 1 })
    const full = await drawPage(page, 1920)
    const ai = downscale(full, 1536)
    const [image, aiImage, hint] = await Promise.all([
      canvasToBlob(full, 'image/jpeg', 0.9),
      canvasToBlob(ai, 'image/jpeg', 0.85),
      textHint(page),
    ])
    return {
      page: pageNumber,
      image,
      width: full.width,
      height: full.height,
      pointWidth: base.width,
      pointHeight: base.height,
      aiImage,
      textHint: hint,
    }
  } finally {
    page.cleanup()
  }
}

/** Small preview of a page for the page picker. */
export async function renderThumbnail(doc: PDFDocumentProxy, pageNumber: number, longSide = 320): Promise<Blob> {
  const page = await doc.getPage(pageNumber)
  try {
    return await canvasToBlob(await drawPage(page, longSide), 'image/jpeg', 0.75)
  } finally {
    page.cleanup()
  }
}
