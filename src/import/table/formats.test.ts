import { describe, expect, it } from 'vitest'
import { ANKI_BASIC, ANKI_EXPORT, ANKI_LEGACY, EXCEL_SEMICOLON, NAMED_CSV, PLECO_EXPORT, QUIZLET_COMMA, QUIZLET_TAB } from './fixtures'
import { cleanHanzi, parseTable, slugTag, splitHanziPinyin, stripHtml, tagFromFileName, traditionalOf } from './formats'

describe('parseTable', () => {
  it('reads an Anki export: header lines, HTML, sound tags, fixed columns', () => {
    const t = parseTable(ANKI_EXPORT)
    expect(t).toMatchObject({ format: 'anki', label: 'Looks like an Anki export', delimiter: '\t', fileTags: [] })
    expect(t.fixedRoles).toEqual(['ignore', 'ignore', 'ignore', undefined, undefined, undefined, 'tags'])
    expect(t.columns).toEqual(['', '', '', '', '', '', ''])
    expect(t.rows.map((r) => r.slice(3))).toEqual([
      ['老師', 'lǎoshī', 'teacher\ninstructor', 'HSK1 people'],
      ['學生', 'xué shēng', 'student, pupil', 'HSK1'],
      ['謝謝', 'xièxie', 'thanks&more', ''],
    ])
  })

  it('reads Anki #columns names with a named separator', () => {
    const t = parseTable(ANKI_BASIC)
    expect(t).toMatchObject({ format: 'anki', delimiter: ',', columns: ['Front', 'Back'] })
    expect(t.rows).toEqual([
      ['老師', 'lǎoshī\nteacher'],
      ['學生', 'xuésheng\nstudent'],
    ])
  })

  it('recognises an older Anki export without header lines', () => {
    const t = parseTable(ANKI_LEGACY)
    expect(t.format).toBe('anki')
    expect(t.rows).toEqual([
      ['老師', 'lǎoshī', 'teacher'],
      ['學生', 'xuésheng', 'student\npupil'],
    ])
  })

  it('reads a Pleco export: categories as tags, no quoting, formatting removed', () => {
    const t = parseTable(PLECO_EXPORT)
    expect(t).toMatchObject({ format: 'pleco', label: 'Looks like a Pleco export', columns: ['', '', ''] })
    expect(t.rows).toEqual([
      ['你们[你們]', 'ni3men5', 'you (plural)'],
      ['老师[老師]', 'lao3shi1', 'noun teacher'],
      ['我', 'wo3', 'pronoun I; me'],
      ['米饭[米飯]', 'mi3fan4', 'cooked "rice'],
    ])
    expect(t.rowTags).toEqual([['hsk-1'], ['hsk-1'], ['hsk-1'], ['food-rice']])
  })

  it('recognises Pleco by numbered pinyin alone', () => {
    expect(parseTable('老師\tlao3shi1\tteacher\n學生\txue2sheng5\tstudent\n').format).toBe('pleco')
  })

  it('reads Quizlet with tabs and with commas (definitions keep their commas)', () => {
    const tab = parseTable(QUIZLET_TAB)
    expect(tab).toMatchObject({ format: 'quizlet', label: 'Looks like a Quizlet export', delimiter: '\t' })
    expect(tab.rows[1]).toEqual(['學生 (xuésheng)', 'student'])

    const comma = parseTable(QUIZLET_COMMA)
    expect(comma).toMatchObject({ format: 'quizlet', delimiter: ',' })
    expect(comma.rows).toEqual([
      ['老師', 'teacher, instructor'],
      ['學生', 'student'],
    ])
  })

  it('reads an Excel CSV: BOM, semicolons, quotes, line breaks, header row, blank rows dropped', () => {
    const t = parseTable(EXCEL_SEMICOLON)
    expect(t).toMatchObject({ format: 'csv', label: 'Looks like a CSV file (with semicolons)', delimiter: ';', columns: ['漢字', '拼音', '英文', '例句', '備註'] })
    expect(t.rows).toEqual([
      ['老師', 'lǎoshī', 'teacher; instructor', '我是老師。', 'line one\nline two'],
      ['學生', 'xuésheng', 'student', '', ''],
    ])
  })

  it('takes a first row of known names as the header, but not a row of data', () => {
    expect(parseTable(NAMED_CSV).columns).toEqual(['Chinese', 'Pinyin', 'English', 'Example', 'Example pinyin', 'Example meaning', 'Tags'])
    expect(parseTable('中文,zhōngwén,Chinese\n老師,lǎoshī,teacher').columns).toEqual(['', '', ''])
    expect(parseTable('詞,word\n老師,teacher').rows).toHaveLength(2)
    expect(parseTable('Chinese,Lesson\n老師,1\n學生,1').columns).toEqual(['Chinese', 'Lesson'])
    expect(parseTable('Word\n老師\n學生').columns).toEqual(['Word'])
    expect(parseTable('Hello,World\n老師,teacher').columns).toEqual(['', ''])
  })

  it('reads a plain list of words', () => {
    const t = parseTable('老師\r\n學生\r\n\r\n謝謝')
    expect(t).toMatchObject({ label: 'Looks like a list of words, one per line', columns: [''] })
    expect(t.rows).toEqual([['老師'], ['學生'], ['謝謝']])
  })

  it('pads short rows and survives a stray quote', () => {
    const t = parseTable('漢字,拼音,意思,備註\n老師,lǎoshī\n"學生,xuésheng,student,x\n')
    expect(t.rows).toEqual([
      ['老師', 'lǎoshī', '', ''],
      ['"學生', 'xuésheng', 'student', 'x'],
    ])
  })
})

describe('cell helpers', () => {
  it('strips HTML and decodes entities', () => {
    expect(stripHtml('a<br/>b<div>c</div><img src="x.png">&lt;d&gt; &#20320;&#x597D; &bogus;')).toBe('a\nb\nc\n<d> 你好 &bogus;')
  })

  it('keeps the Traditional form of 简[繁]', () => {
    expect(traditionalOf('你们[你們]')).toBe('你們')
    const isSimplified = (t: string) => t.includes('们')
    expect(traditionalOf('你們[你们]', isSimplified)).toBe('你們')
    expect(traditionalOf('你们[你們]', isSimplified)).toBe('你們')
    expect(traditionalOf('老師')).toBe('老師')
  })

  it('splits characters and pinyin in one cell', () => {
    expect(splitHanziPinyin('老師 lǎoshī')).toEqual({ hanzi: '老師', pinyin: 'lǎoshī' })
    expect(splitHanziPinyin('老師（lǎo shī）')).toEqual({ hanzi: '老師', pinyin: 'lǎo shī' })
    expect(splitHanziPinyin('lao3shi1 老師')).toEqual({ hanzi: '老師', pinyin: 'lao3shi1' })
    expect(splitHanziPinyin('你好嗎\nnǐ hǎo ma')).toEqual({ hanzi: '你好嗎', pinyin: 'nǐ hǎo ma' })
    for (const whole of ['老師', '卡拉OK', '老師 teacher', '老師 lǎoshī teacher', 'T恤']) expect(splitHanziPinyin(whole)).toBeUndefined()
  })

  it('joins characters split by spaces', () => {
    expect(cleanHanzi(' 老 師 ')).toBe('老師')
    expect(cleanHanzi('卡拉 OK')).toBe('卡拉 OK')
  })

  it('makes tags from names', () => {
    expect(slugTag(' HSK 1 / Lesson 3 ')).toBe('hsk-1-lesson-3')
    expect(slugTag('第一課')).toBe('第一課')
    expect(tagFromFileName('HSK1 Vocab.csv')).toBe('hsk1-vocab')
    expect(tagFromFileName('my_words.v2.txt')).toBe('my-words-v2')
  })
})
