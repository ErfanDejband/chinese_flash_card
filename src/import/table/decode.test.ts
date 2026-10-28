import { describe, expect, it } from 'vitest'
import { decodeText } from './decode'

const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)))

function utf16(text: string, littleEndian: boolean, bom = true): Uint8Array {
  const s = (bom ? '\uFEFF' : '') + text
  const bytes = new Uint8Array(s.length * 2)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < s.length; i++) view.setUint16(i * 2, s.charCodeAt(i), littleEndian)
  return bytes
}

const SAMPLE = '漢字,拼音,意思\r\n老師,lao3shi1,teacher\r\n學生,xue2sheng1,student\r\n謝謝,xie4xie5,thank you\r\n'

// SAMPLE in Big5, as Excel on a Taiwan Windows saves a CSV.
const BIG5 =
  'ba7ea6722cabf7adb52cb74eabe40d0aa6d1ae762c6c616f33736869312c746561636865720d0abec7a5cd2c787565327368656e67312c73747564656e740d0ac1c2c1c22c78696534786965352c7468616e6b20796f750d0a'
// The same list in Simplified characters, in GBK.
const GBK =
  'babad7d62cc6b4d2f42cd2e2cbbc0d0ac0cfcaa62c6c616f33736869312c746561636865720d0ad1a7c9fa2c787565327368656e67312c73747564656e740d0ad0bbd0bb2c78696534786965352c7468616e6b20796f750d0a'

describe('decodeText', () => {
  it('reads UTF-8, with or without a BOM', () => {
    expect(decodeText(new TextEncoder().encode(SAMPLE))).toEqual({ text: SAMPLE, encoding: 'utf-8' })
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('老師')]))).toEqual({ text: '老師', encoding: 'utf-8' })
  })

  it('reads UTF-16 with a BOM (Excel "Unicode text")', () => {
    expect(decodeText(utf16(SAMPLE, true))).toEqual({ text: SAMPLE, encoding: 'utf-16le' })
    expect(decodeText(utf16(SAMPLE, false))).toEqual({ text: SAMPLE, encoding: 'utf-16be' })
  })

  it('recognises UTF-16 without a BOM by its zero bytes', () => {
    expect(decodeText(utf16(SAMPLE, true, false))).toEqual({ text: SAMPLE, encoding: 'utf-16le' })
  })

  it('falls back to Big5 for a Taiwan Excel CSV', () => {
    expect(decodeText(hex(BIG5))).toEqual({ text: SAMPLE, encoding: 'big5' })
  })

  it('tells GBK from Big5 by the characters it gives', () => {
    expect(decodeText(hex(GBK))).toEqual({ text: '汉字,拼音,意思\r\n老师,lao3shi1,teacher\r\n学生,xue2sheng1,student\r\n谢谢,xie4xie5,thank you\r\n', encoding: 'gb18030' })
  })

  it('keeps UTF-8 when a legacy reading is no better', () => {
    const broken = new Uint8Array([...new TextEncoder().encode('老師,lǎoshī,teacher\n學生,xuésheng,student\n'), 0xff])
    expect(decodeText(broken).encoding).toBe('utf-8')
  })
})
