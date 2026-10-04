import { describe, expect, it } from 'vitest'
import { sha256Hex } from '@/lib/hash'
import { classifyFiles, combinedHash, describeFiles } from './pickFiles'
import { planTiles, SPLIT_RATIO } from './tiles'

describe('planTiles', () => {
  it('keeps normal images and phone screenshots whole', () => {
    expect(planTiles(4000, 3000)).toEqual([{ x: 0, y: 0, width: 4000, height: 3000 }])
    expect(planTiles(1080, 2400)).toHaveLength(1) // 2.2 : 1
    expect(planTiles(1000, 1000 * SPLIT_RATIO)).toHaveLength(1)
  })

  it('cuts long screenshots into overlapping tiles, the last one flush with the bottom', () => {
    const tiles = planTiles(1080, 6000)
    const tile = Math.round(1080 * 1.6)
    expect(tiles.length).toBe(4)
    expect(tiles.every((t) => t.height === tile && t.width === 1080 && t.x === 0)).toBe(true)
    expect(tiles[0]!.y).toBe(0)
    expect(tiles.at(-1)!.y + tile).toBe(6000)
    // consecutive tiles overlap
    for (let i = 1; i < tiles.length; i++) expect(tiles[i]!.y).toBeLessThan(tiles[i - 1]!.y + tile)
  })
})

describe('classifyFiles', () => {
  const f = (name: string, type = '') => ({ name, type })

  it('accepts one PDF', () => {
    expect(classifyFiles([f('book.pdf', 'application/pdf')])).toMatchObject({ kind: 'pdf', file: { name: 'book.pdf' } })
  })

  it('accepts images and sorts them naturally by name', () => {
    const r = classifyFiles([f('IMG_10.jpg', 'image/jpeg'), f('IMG_2.jpg', 'image/jpeg'), f('scan.HEIC')])
    expect(r.kind === 'images' && r.files.map((x) => x.name)).toEqual(['IMG_2.jpg', 'IMG_10.jpg', 'scan.HEIC'])
  })

  it.each([
    [[f('a.pdf', 'application/pdf'), f('b.jpg', 'image/jpeg')], 'one PDF on its own'],
    [[f('a.pdf'), f('b.pdf')], 'one PDF on its own'],
    [[f('notes.docx', 'application/msword')], 'not a PDF or an image'],
    [[], 'No file'],
  ])('rejects %o', (files, message) => {
    const r = classifyFiles(files)
    expect(r.kind === 'error' && r.message).toContain(message)
  })
})

describe('combinedHash / describeFiles', () => {
  it('does not depend on the order files were picked in', async () => {
    const a = await sha256Hex(new TextEncoder().encode('a'))
    const b = await sha256Hex(new TextEncoder().encode('b'))
    expect(await combinedHash([a, b])).toBe(await combinedHash([b, a]))
    expect(await combinedHash([a])).toBe(a)
    expect(await combinedHash([a, ''])).toBe('')
  })

  it('names a set of files', () => {
    expect(describeFiles(['IMG_1.jpg'])).toBe('IMG_1.jpg')
    expect(describeFiles(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_3.jpg'])).toBe('IMG_1.jpg + 2 more')
  })
})
