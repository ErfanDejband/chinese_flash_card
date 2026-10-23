import { canvasToBlob } from '../render'
import type { NormBox } from '../types'

/**
 * The import demo's page: a made-up "Lesson 1" vocabulary page drawn on a canvas, so trying an
 * import needs no file, no AI key and no network. Its canned AI reply (`sampleReply`) comes from
 * the same layout, so the picture boxes cut out the right pictures.
 */
interface SampleItem {
  hanzi: string
  pinyin: string
  meaning: string
  emoji: string
  /** The page shows only pinyin and the picture: the "AI" fills in the characters. */
  pinyinOnly?: true
  /** What the "AI" answers instead of `hanzi`: a Simplified spelling, to show the flag. */
  reply?: string
}

export const SAMPLE_ITEMS: readonly SampleItem[] = [
  { hanzi: '書包', pinyin: 'shūbāo', meaning: 'schoolbag', emoji: '🎒' },
  { hanzi: '手機', pinyin: 'shǒujī', meaning: 'cell phone', emoji: '📱' },
  { hanzi: '學校', pinyin: 'xuéxiào', meaning: 'school', emoji: '🏫' },
  { hanzi: '雨傘', pinyin: 'yǔsǎn', meaning: 'umbrella', emoji: '☂️' },
  { hanzi: '咖啡', pinyin: 'kāfēi', meaning: 'coffee', emoji: '☕', pinyinOnly: true },
  { hanzi: '電腦', pinyin: 'diànnǎo', meaning: 'computer', emoji: '💻', reply: '电脑' },
]

export const SAMPLE_FILE_NAME = 'Sample page.png'

const WIDTH = 1200
const HEIGHT = 1500
const COLUMNS = 2
const TOP = 240
const CELL_W = WIDTH / COLUMNS
const CELL_H = 420
const PICTURE = 240

const HAN_FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif'
const LATIN_FONT = 'system-ui, "Segoe UI", Roboto, sans-serif'
const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Twemoji Mozilla", sans-serif'

/** Top-left corner of item i's picture, in page pixels. */
function picturePosition(i: number): { x: number; y: number } {
  const col = i % COLUMNS
  const row = Math.floor(i / COLUMNS)
  return { x: col * CELL_W + (CELL_W - PICTURE) / 2, y: TOP + row * CELL_H + 20 }
}

/** Item i's picture as the AI reports it: [ymin, xmin, ymax, xmax], 0–1000. */
export function samplePictureBox(i: number): NormBox {
  const { x, y } = picturePosition(i)
  const ny = (v: number) => Math.round((v / HEIGHT) * 1000)
  const nx = (v: number) => Math.round((v / WIDTH) * 1000)
  return [ny(y), nx(x), ny(y + PICTURE), nx(x + PICTURE)]
}

/** The reply a vision model would give for the sample page (vocabulary task). */
export function sampleReply(): string {
  return JSON.stringify({
    items: SAMPLE_ITEMS.map((item, i) => ({
      kind: 'word',
      hanzi: item.reply ?? item.hanzi,
      pinyin: item.pinyin,
      meaning: item.meaning,
      partOfSpeech: '',
      notes: '',
      hanziSource: item.pinyinOnly ? 'inferred' : 'printed',
      pinyinSource: 'printed',
      meaningSource: 'printed',
      imageBox: samplePictureBox(i),
      confidence: item.pinyinOnly ? 0.85 : 0.97,
    })),
  })
}

/** Draw the sample page as a PNG file (uses this device's fonts). */
export async function createSamplePage(): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fffdf8'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = '#1c1917'
  ctx.font = `bold 72px ${HAN_FONT}`
  ctx.fillText('第一課 生詞', WIDTH / 2, 120)
  ctx.fillStyle = '#6b635c'
  ctx.font = `36px ${LATIN_FONT}`
  ctx.fillText('Lesson 1 · New words', WIDTH / 2, 180)

  SAMPLE_ITEMS.forEach((item, i) => {
    const { x, y } = picturePosition(i)
    const centre = x + PICTURE / 2
    ctx.fillStyle = '#f1ebe1'
    ctx.beginPath()
    ctx.roundRect(x, y, PICTURE, PICTURE, 28)
    ctx.fill()
    ctx.textBaseline = 'middle'
    ctx.font = `170px ${EMOJI_FONT}`
    ctx.fillText(item.emoji, centre, y + PICTURE * 0.54)
    ctx.textBaseline = 'alphabetic'

    let line = y + PICTURE + 70
    if (!item.pinyinOnly) {
      ctx.fillStyle = '#1c1917'
      ctx.font = `60px ${HAN_FONT}`
      ctx.fillText(item.hanzi, centre, line)
      line += 50
    }
    ctx.fillStyle = '#c2410c'
    ctx.font = `38px ${LATIN_FONT}`
    ctx.fillText(item.pinyin, centre, line)
    ctx.fillStyle = '#6b635c'
    ctx.font = `30px ${LATIN_FONT}`
    ctx.fillText(item.meaning, centre, line + 42)
  })

  return new File([await canvasToBlob(canvas, 'image/png', 1)], SAMPLE_FILE_NAME, { type: 'image/png' })
}
