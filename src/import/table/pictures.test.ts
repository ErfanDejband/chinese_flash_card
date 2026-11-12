import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { guessRoles } from './columns'
import { parseTable } from './formats'
import { findPictureFile, isPictureRef, markerIndex, pictureMarker } from './pictures'
import { buildDrafts, DEFAULT_WORD_LIST_OPTIONS } from './rows'
import { tableFromRows } from './sheets'
import { readXlsx } from './xlsx'

const PNG1 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1])
const PNG2 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 2])
const PNG3 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 3])

const inline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`

/** Excel's two ways: a picture placed in C2 (rich value), and pictures floating over C3 and over B4 (which has text). */
function workbookWithPictures() {
  const sheet =
    `<worksheet><sheetData>` +
    `<row r="1">${inline('A1', 'Characters')}${inline('B1', 'Meaning')}${inline('C1', 'Picture')}</row>` +
    `<row r="2">${inline('A2', '蘋果')}${inline('B2', 'apple')}<c r="C2" t="e" vm="1"><v>#VALUE!</v></c></row>` +
    `<row r="3">${inline('A3', '香蕉')}${inline('B3', 'banana')}</row>` +
    `<row r="4">${inline('A4', '西瓜')}${inline('B4', 'watermelon')}</row>` +
    `</sheetData><drawing r:id="rId1"/></worksheet>`
  const anchor = (kind: string, from: [number, number], to?: [number, number], id = 'rId1') =>
    `<xdr:${kind}><xdr:from><xdr:col>${from[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${from[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    (to ? `<xdr:to><xdr:col>${to[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${to[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` : '<xdr:ext cx="1" cy="1"/>') +
    `<xdr:pic><xdr:blipFill><a:blip r:embed="${id}"/></xdr:blipFill></xdr:pic><xdr:clientData/></xdr:${kind}>`
  return zipSync({
    'xl/workbook.xml': strToU8('<workbook xmlns:r="r"><sheets><sheet name="Fruit" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    'xl/worksheets/_rels/sheet1.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="../drawings/drawing1.xml"/></Relationships>'),
    // C3 is under the middle of a picture spanning C3:D4; another sits on B4, which has text.
    'xl/drawings/drawing1.xml': strToU8(`<xdr:wsDr xmlns:xdr="x" xmlns:a="a" xmlns:r="r">${anchor('twoCellAnchor', [2, 2], [3, 3], 'rId1')}${anchor('oneCellAnchor', [1, 3], undefined, 'rId2')}</xdr:wsDr>`),
    'xl/drawings/_rels/drawing1.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="../media/image2.png"/><Relationship Id="rId2" Target="/xl/media/image3.png"/></Relationships>'),
    'xl/metadata.xml': strToU8(
      '<metadata xmlns:xlrd="x"><metadataTypes count="1"><metadataType name="XLRICHVALUE"/></metadataTypes>' +
        '<futureMetadata name="XLRICHVALUE" count="1"><bk><extLst><ext uri="u"><xlrd:rvb i="0"/></ext></extLst></bk></futureMetadata>' +
        '<valueMetadata count="1"><bk><rc t="1" v="0"/></bk></valueMetadata></metadata>',
    ),
    'xl/richData/rdrichvaluestructure.xml': strToU8('<rvStructures count="1"><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s></rvStructures>'),
    'xl/richData/rdrichvalue.xml': strToU8('<rvData count="1"><rv s="0"><v>0</v><v>5</v></rv></rvData>'),
    'xl/richData/richValueRel.xml': strToU8('<richValueRels xmlns:r="r"><rel r:id="rId1"/></richValueRels>'),
    'xl/richData/_rels/richValueRel.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>'),
    'xl/media/image1.png': PNG1,
    'xl/media/image2.png': PNG2,
    'xl/media/image3.png': PNG3,
  })
}

describe('pictures in Excel workbooks', () => {
  it('puts each picture in its cell: placed in the cell, under a floating picture’s middle, or in a new column when the cell has text', () => {
    const { sheets, pictures } = readXlsx(workbookWithPictures())
    const rows = sheets[0]!.rows
    const pic = (cell: string | undefined) => pictures[markerIndex(cell ?? '') ?? -1]?.data
    expect(pic(rows[1]![2])).toEqual(PNG1)
    expect(pic(rows[2]![2])).toEqual(PNG2)
    expect(rows[3]!.slice(0, 2)).toEqual(['西瓜', 'watermelon'])
    expect(pic(rows[3]![3])).toEqual(PNG3)
    expect(pictures.map((p) => p.mime)).toEqual(['image/png', 'image/png', 'image/png'])
  })

  it('makes the picture column the image role, and each row’s draft keeps its picture', () => {
    const { sheets } = readXlsx(workbookWithPictures())
    const table = tableFromRows(sheets[0]!.rows.slice(0, 3))
    const roles = guessRoles(table)
    expect(roles).toEqual(['hanzi', 'meaning', 'image'])
    const drafts = buildDrafts(table, roles, DEFAULT_WORD_LIST_OPTIONS, { existingHanzi: new Set(), knownHanzi: new Set() }).drafts
    expect(drafts.map((d) => [d.hanzi, markerIndex(d.picture ?? '')])).toEqual([
      ['蘋果', 0],
      ['香蕉', 1],
    ])
  })
})

describe('picture file names', () => {
  it('are a picture column by content, and flag the files not chosen', () => {
    const table = parseTable('Characters\tMeaning\tFile\n蘋果\tapple\tapple.JPG\n香蕉\tbanana\tfruit/banana.png\n西瓜\twatermelon\t\n')
    const roles = guessRoles(table)
    expect(roles).toEqual(['hanzi', 'meaning', 'image'])
    const files = [{ name: 'Apple.jpg' }]
    const result = buildDrafts(table, roles, DEFAULT_WORD_LIST_OPTIONS, {
      existingHanzi: new Set(),
      knownHanzi: new Set(),
      hasPicture: (ref) => !!findPictureFile(ref, files),
    })
    expect(result.rows.map((r) => [r.draft.picture, r.issues.filter((i) => i === 'picture-missing')])).toEqual([
      ['apple.JPG', []],
      ['fruit/banana.png', ['picture-missing']],
      [undefined, []],
    ])
  })

  it('match by name in any case and folder, else without the extension', () => {
    const files = [{ name: 'apple.png' }, { name: 'Banana.JPG' }]
    expect(findPictureFile('APPLE.PNG', files)?.name).toBe('apple.png')
    expect(findPictureFile('pics\\banana.jpg', files)?.name).toBe('Banana.JPG')
    expect(findPictureFile('apple', files)?.name).toBe('apple.png')
    expect(findPictureFile('apple.jpg', files)?.name).toBe('apple.png')
    expect(findPictureFile('cherry.png', files)).toBeUndefined()
  })

  it('markers and names are told from other text', () => {
    expect(markerIndex(pictureMarker(4))).toBe(4)
    expect(isPictureRef(pictureMarker(0))).toBe(true)
    expect(isPictureRef('dog.webp')).toBe(true)
    expect(isPictureRef('a dog')).toBe(false)
    expect(isPictureRef('蘋果')).toBe(false)
  })
})
