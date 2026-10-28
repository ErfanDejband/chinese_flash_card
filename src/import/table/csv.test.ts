import { describe, expect, it } from 'vitest'
import { ankiSeparator, parseDelimited, sniffDelimiter } from './csv'

const rows = (text: string, delimiter = ',', quotes = true) => parseDelimited(text, delimiter, quotes).rows

describe('parseDelimited', () => {
  it('splits rows on \\n, \\r\\n and \\r and keeps empty fields', () => {
    expect(rows('a,b\r\nc,\rd,e\n')).toEqual([
      ['a', 'b'],
      ['c', ''],
      ['d', 'e'],
    ])
  })

  it('reads quoted fields with delimiters, doubled quotes and line breaks', () => {
    expect(rows('"老師, teacher","say ""hi""","line one\r\nline two"\n學生,x,y')).toEqual([
      ['老師, teacher', 'say "hi"', 'line one\r\nline two'],
      ['學生', 'x', 'y'],
    ])
  })

  it('keeps quotes inside an unquoted field and text after a closing quote', () => {
    expect(rows('a "b" c,"d" e')).toEqual([['a "b" c', 'd e']])
  })

  it('reports an unterminated quote', () => {
    expect(parseDelimited('"open,and\nnever closed', ',')).toEqual({ rows: [['open,and\nnever closed']], unterminated: true })
  })

  it('can ignore quotes (Pleco)', () => {
    expect(rows('"to be" (copula)\tshi4\n', '\t', false)).toEqual([['"to be" (copula)', 'shi4']])
  })

  it('handles a last line without a line break and an empty text', () => {
    expect(rows('a;b', ';')).toEqual([['a', 'b']])
    expect(rows('')).toEqual([])
  })
})

describe('sniffDelimiter', () => {
  it('finds tab, comma, semicolon and pipe', () => {
    expect(sniffDelimiter('老師\tlǎoshī\tteacher, instructor\n學生\txuésheng\tstudent')).toBe('\t')
    expect(sniffDelimiter('老師,lǎoshī,teacher\n學生,xuésheng,student')).toBe(',')
    expect(sniffDelimiter('漢字;拼音;英文\n老師;lǎoshī;teacher, instructor\n學生;xuésheng;student')).toBe(';')
    expect(sniffDelimiter('老師|lǎoshī|teacher\n學生|xuésheng|student')).toBe('|')
  })

  it('ignores delimiters inside quotes', () => {
    expect(sniffDelimiter('a;"b,c,d";e\nf;"g,h";i')).toBe(';')
  })

  it('falls back to tab for a list of single words', () => {
    expect(sniffDelimiter('老師\n學生\n謝謝')).toBe('\t')
  })
})

describe('ankiSeparator', () => {
  it('reads names and literal characters', () => {
    expect(ankiSeparator('tab')).toBe('\t')
    expect(ankiSeparator('Comma')).toBe(',')
    expect(ankiSeparator('semicolon')).toBe(';')
    expect(ankiSeparator('Pipe')).toBe('|')
    expect(ankiSeparator('colon')).toBe(':')
    expect(ankiSeparator('space')).toBe(' ')
    expect(ankiSeparator(',')).toBe(',')
    expect(ankiSeparator('\t')).toBe('\t')
    expect(ankiSeparator('')).toBeUndefined()
  })
})
