import { describe, expect, it } from 'vitest'
import { parsePictureFileName, pictureFileName } from './pictures'

describe('picture file names', () => {
  it('carry the id, size and type, and read back', () => {
    const p = { id: '6f1c-42ab-9d00', mime: 'image/webp', width: 800, height: 800 }
    expect(pictureFileName(p)).toBe('pic-6f1c-42ab-9d00-800x800.webp')
    expect(parsePictureFileName(pictureFileName(p))).toEqual(p)
    expect(parsePictureFileName(pictureFileName({ ...p, mime: 'image/jpeg' }))?.mime).toBe('image/jpeg')
  })

  it('ignore other files in the app folder', () => {
    expect(parsePictureFileName('cards.json.gz')).toBeNull()
    expect(parsePictureFileName('pic-x-10x10.bmp')).toBeNull()
  })
})
