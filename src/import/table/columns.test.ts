import { describe, expect, it } from 'vitest'
import { assignRole, guessRoles, roleFromName } from './columns'
import { ANKI_BASIC, ANKI_EXPORT, EXCEL_SEMICOLON, NAMED_CSV, PLECO_EXPORT, QUIZLET_COMMA, QUIZLET_TAB } from './fixtures'
import { parseTable } from './formats'

const guess = (text: string) => guessRoles(parseTable(text))

describe('roleFromName', () => {
  it.each([
    ['Hanzi', 'hanzi'],
    ['Traditional', 'hanzi'],
    ['漢字', 'hanzi'],
    ['中文', 'hanzi'],
    ['Pinyin', 'pinyin'],
    ['拼音', 'pinyin'],
    ['Reading', 'pinyin'],
    ['English', 'meaning'],
    ['Definition', 'meaning'],
    ['意思', 'meaning'],
    ['Example', 'example'],
    ['例句', 'example'],
    ['Example pinyin', 'examplePinyin'],
    ['Example meaning', 'exampleMeaning'],
    ['Tags', 'tags'],
    ['標籤', 'tags'],
    ['Notes', 'notes'],
    ['GUID', 'ignore'],
    ['English meaning', 'meaning'],
    ['Pinyin (with tones)', 'pinyin'],
    ['Chinese characters', 'hanzi'],
    ['Sentence (English)', 'exampleMeaning'],
  ])('%s → %s', (name, role) => {
    expect(roleFromName(name)?.role).toBe(role)
  })

  it('knows how sure a name is', () => {
    expect(roleFromName('Traditional')?.rank).toBe(3)
    expect(roleFromName('Simplified')?.rank).toBe(1)
    expect(roleFromName('Front')).toEqual({ role: 'hanzi', rank: 0 })
    expect(roleFromName('Back')).toEqual({ role: 'meaning', rank: 0 })
    expect(roleFromName('老師')).toBeUndefined()
    expect(roleFromName('')).toBeUndefined()
  })
})

describe('guessRoles', () => {
  it('uses Anki’s fixed columns and the content of the rest', () => {
    expect(guess(ANKI_EXPORT)).toEqual(['ignore', 'ignore', 'ignore', 'hanzi', 'pinyin', 'meaning', 'tags'])
  })

  it('follows generic names only when the content agrees', () => {
    expect(guess(ANKI_BASIC)).toEqual(['hanzi', 'meaning'])
    expect(guess('#separator:tab\n#columns:Front\tBack\nteacher\t老師\nstudent\t學生\n')).toEqual(['meaning', 'hanzi'])
  })

  it('reads Pleco and Quizlet exports from their content', () => {
    expect(guess(PLECO_EXPORT)).toEqual(['hanzi', 'pinyin', 'meaning'])
    expect(guess(QUIZLET_TAB)).toEqual(['hanzi', 'meaning'])
    expect(guess(QUIZLET_COMMA)).toEqual(['hanzi', 'meaning'])
    expect(guess('teacher\t老師 lǎoshī\nstudent\t學生 xuésheng\n')).toEqual(['meaning', 'hanzi'])
  })

  it('uses header names', () => {
    expect(guess(EXCEL_SEMICOLON)).toEqual(['hanzi', 'pinyin', 'meaning', 'example', 'notes'])
    expect(guess(NAMED_CSV)).toEqual(['hanzi', 'pinyin', 'meaning', 'example', 'examplePinyin', 'exampleMeaning', 'tags'])
  })

  it('prefers a Traditional column to a Simplified one', () => {
    expect(guess('Simplified,Traditional,Pinyin,English\n老师,老師,lǎoshī,teacher\n')).toEqual(['ignore', 'hanzi', 'pinyin', 'meaning'])
  })

  it('tells characters, pinyin, meaning, example and its pinyin and meaning apart by content', () => {
    const tsv = ['老師\tlǎoshī\tteacher\t我是老師。\tWǒ shì lǎoshī.\tI am a teacher.', '學生\txuésheng\tstudent\t他是學生嗎？\tTā shì xuésheng ma?\tIs he a student?'].join('\n')
    expect(guess(tsv)).toEqual(['hanzi', 'pinyin', 'meaning', 'example', 'examplePinyin', 'exampleMeaning'])
  })

  it('finds pinyin without tone marks and skips number columns', () => {
    expect(guess('1,老師,laoshi,teacher\n2,學生,xuesheng,student\n3,謝謝,xiexie,thanks\n')).toEqual(['ignore', 'hanzi', 'pinyin', 'meaning'])
  })

  it('prefers the reading of the characters to other pinyin-like text', () => {
    expect(guess('HSK1\t老師\tlǎoshī\tteacher\nHSK2\t學生\txuésheng\tstudent\n')).toEqual(['notes', 'hanzi', 'pinyin', 'meaning'])
  })

  it('makes extra text a note and empty columns ignored', () => {
    expect(guess('老師\tlǎoshī\tteacher\t\tperson\n學生\txuésheng\tstudent\t\tperson\n')).toEqual(['hanzi', 'pinyin', 'meaning', 'ignore', 'notes'])
  })
})

describe('assignRole', () => {
  it('moves a single role away from the column that had it', () => {
    expect(assignRole(['hanzi', 'pinyin', 'meaning'], 2, 'hanzi')).toEqual(['ignore', 'pinyin', 'hanzi'])
    expect(assignRole(['hanzi', 'notes', 'meaning'], 2, 'notes')).toEqual(['hanzi', 'notes', 'notes'])
  })
})
