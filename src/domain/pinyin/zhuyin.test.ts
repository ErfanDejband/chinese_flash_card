import { polyphonic } from 'pinyin-pro'
import { describe, expect, it } from 'vitest'
import { toZhuyin } from './zhuyin'
import { SYLLABLES, VOWEL_START } from './zhuyinData'

describe('toZhuyin: spelling', () => {
  it.each([
    ['bō', 'ㄅㄛ'],
    ['fó', 'ㄈㄛˊ'],
    ['fēng', 'ㄈㄥ'],
    ['zhī', 'ㄓ'],
    ['chī', 'ㄔ'],
    ['shì', 'ㄕˋ'],
    ['rì', 'ㄖˋ'],
    ['zì', 'ㄗˋ'],
    ['cì', 'ㄘˋ'],
    ['sì', 'ㄙˋ'],
    ['jī', 'ㄐㄧ'],
    ['qī', 'ㄑㄧ'],
    ['xī', 'ㄒㄧ'],
    ['jūn', 'ㄐㄩㄣ'],
    ['qù', 'ㄑㄩˋ'],
    ['xué', 'ㄒㄩㄝˊ'],
    ['juān', 'ㄐㄩㄢ'],
    ['lǜ', 'ㄌㄩˋ'],
    ['nǚ', 'ㄋㄩˇ'],
    ['lüè', 'ㄌㄩㄝˋ'],
    ['yī', 'ㄧ'],
    ['yě', 'ㄧㄝˇ'],
    ['yǒu', 'ㄧㄡˇ'],
    ['yīng', 'ㄧㄥ'],
    ['yōng', 'ㄩㄥ'],
    ['yuè', 'ㄩㄝˋ'],
    ['yuán', 'ㄩㄢˊ'],
    ['yún', 'ㄩㄣˊ'],
    ['yú', 'ㄩˊ'],
    ['wǔ', 'ㄨˇ'],
    ['wǒ', 'ㄨㄛˇ'],
    ['wèi', 'ㄨㄟˋ'],
    ['wēng', 'ㄨㄥ'],
    ['liù', 'ㄌㄧㄡˋ'],
    ['guǐ', 'ㄍㄨㄟˇ'],
    ['dūn', 'ㄉㄨㄣ'],
    ['hóng', 'ㄏㄨㄥˊ'],
    ['qióng', 'ㄑㄩㄥˊ'],
    ['zhuāng', 'ㄓㄨㄤ'],
    ['ér', 'ㄦˊ'],
    ['ê', 'ㄝ'],
    ['ēn', 'ㄣ'],
    ['àn', 'ㄢˋ'],
  ])('%s → %s', (pinyin, zhuyin) => {
    expect(toZhuyin(pinyin)).toBe(zhuyin)
  })
})

describe('toZhuyin: tones', () => {
  it('marks each tone, with none for the first', () => {
    expect(toZhuyin('mā má mǎ mà')).toBe('ㄇㄚ ㄇㄚˊ ㄇㄚˇ ㄇㄚˋ')
  })

  it('puts the neutral tone in front of its syllable', () => {
    expect(toZhuyin('māma', '媽媽')).toBe('ㄇㄚ ˙ㄇㄚ')
    expect(toZhuyin('xǐhuan')).toBe('ㄒㄧˇ ˙ㄏㄨㄢ')
  })

  it('leaves tones out of text that has no tone marks at all', () => {
    expect(toZhuyin('ni hao')).toBe('ㄋㄧ ㄏㄠ')
  })

  it('reads tone numbers and capitals', () => {
    expect(toZhuyin('lao3shi1')).toBe('ㄌㄠˇ ㄕ')
    expect(toZhuyin('Lǎoshī')).toBe('ㄌㄠˇ ㄕ')
    expect(toZhuyin('nv3')).toBe('ㄋㄩˇ')
  })
})

describe('toZhuyin: words that can split two ways', () => {
  it.each([
    ['fāngàn', '方案', 'ㄈㄤ ㄢˋ'],
    ['dàngāo', '蛋糕', 'ㄉㄢˋ ㄍㄠ'],
    ['wǎnān', '晚安', 'ㄨㄢˇ ㄢ'],
    ['píngān', '平安', 'ㄆㄧㄥˊ ㄢ'],
    ['qīnài', '親愛', 'ㄑㄧㄣ ㄞˋ'],
    ['shíèr', '十二', 'ㄕˊ ㄦˋ'],
    ['xīān', '西安', 'ㄒㄧ ㄢ'],
    ['tiānānmén', '天安門', 'ㄊㄧㄢ ㄢ ㄇㄣˊ'],
    ['nǚér', '女兒', 'ㄋㄩˇ ㄦˊ'],
    ['gōngān', '公安', 'ㄍㄨㄥ ㄢ'],
    ['dáàn', '答案', 'ㄉㄚˊ ㄢˋ'],
    ['kěài', '可愛', 'ㄎㄜˇ ㄞˋ'],
    ['ǒuěr', '偶爾', 'ㄡˇ ㄦˇ'],
    ['fānɡàn', '翻幹', 'ㄈㄢ ㄍㄢˋ'],
  ])('%s + %s → %s', (pinyin, hanzi, zhuyin) => {
    expect(toZhuyin(pinyin, hanzi)).toBe(zhuyin)
  })

  it('uses the number of characters when the letters have no tone marks', () => {
    expect(toZhuyin('xian', '先')).toBe('ㄒㄧㄢ')
    expect(toZhuyin('xian', '西安')).toBe('ㄒㄧ ㄢ')
  })

  it('follows the spelling rule without characters', () => {
    expect(toZhuyin('fāngàn')).toBe('ㄈㄢ ㄍㄢˋ')
  })

  it('always splits at an apostrophe', () => {
    expect(toZhuyin("fāng'àn")).toBe('ㄈㄤ ㄢˋ')
    expect(toZhuyin('fāng’àn')).toBe('ㄈㄤ ㄢˋ')
  })

  it('does not take the r of the next syllable for erhua', () => {
    expect(toZhuyin('dàrén', '大人')).toBe('ㄉㄚˋ ㄖㄣˊ')
  })
})

describe('toZhuyin: erhua', () => {
  it('adds ㄦ to the syllable', () => {
    expect(toZhuyin('wánr', '玩兒')).toBe('ㄨㄢˊㄦ')
    expect(toZhuyin('zhèr', '這兒')).toBe('ㄓㄜˋㄦ')
    expect(toZhuyin('yìdiǎnr', '一點兒')).toBe('ㄧˋ ㄉㄧㄢˇㄦ')
    expect(toZhuyin('yìdiǎnr', '一點')).toBe('ㄧˋ ㄉㄧㄢˇㄦ')
  })

  it('reads a written-out 兒 as its own syllable', () => {
    expect(toZhuyin('wánér', '玩兒')).toBe('ㄨㄢˊ ㄦˊ')
  })
})

describe('toZhuyin: sentences', () => {
  it('keeps the punctuation and follows the characters across words', () => {
    expect(toZhuyin('Wǒ xǐhuan hē chá.', '我喜歡喝茶。')).toBe('ㄨㄛˇ ㄒㄧˇ ˙ㄏㄨㄢ ㄏㄜ ㄔㄚˊ.')
    expect(toZhuyin('Wǎnān, fāngàn hǎo ma?', '晚安，方案好嗎？')).toBe('ㄨㄢˇ ㄢ, ㄈㄤ ㄢˋ ㄏㄠˇ ˙ㄇㄚ?')
  })
})

describe('toZhuyin: when it can not convert', () => {
  it.each([[''], ['   '], ['b'], ['hello'], ['T xù'], ['hng'], ['老師'], ['...']])('%j → null', (text) => {
    expect(toZhuyin(text)).toBeNull()
  })

  it('leaves a zhuyin symbol card alone, even when its pinyin is a syllable', () => {
    expect(toZhuyin('a', 'ㄚ')).toBeNull()
  })
})

describe('tables against the dictionary', () => {
  const readings = (ch: string) => polyphonic(ch, { type: 'array', toneType: 'symbol' })[0] ?? []
  const toneless = (s: string) => s.normalize('NFD').replace(/[̄́̌̀]/g, '').normalize('NFC')
  const dictionary: [string, string[]][] = []
  for (let code = 0x4e00; code <= 0x9fff; code++) {
    const ch = String.fromCodePoint(code)
    dictionary.push([ch, readings(ch).map(toneless)])
  }

  it('knows every syllable and reading the dictionary has', () => {
    const missing = new Set<string>()
    for (const [, keys] of dictionary) {
      for (const key of keys) {
        if (/^[a-zêü]+$/.test(key) && !['m', 'n', 'ng', 'hng'].includes(key) && !SYLLABLES.includes(key)) missing.add(key)
      }
    }
    expect([...missing]).toEqual([])
    const unconverted = SYLLABLES.filter((s) => !toZhuyin(s) || /undefined/.test(toZhuyin(s)!))
    expect(unconverted).toEqual([])
  })

  it('writes every syllable differently', () => {
    expect(new Set(SYLLABLES.map((s) => toZhuyin(s))).size).toBe(SYLLABLES.length)
  })

  it('lists exactly the characters with a vowel-start reading', () => {
    const expected = dictionary.filter(([, keys]) => keys.some((k) => /^[aeoê]/.test(k))).map(([ch]) => ch)
    expect([...VOWEL_START]).toEqual(expected)
  })
})
