import type { Card, Example } from './types'

/** Tag on the symbol cards added from Settings → Study. */
export const ZHUYIN_TAG = 'zhuyin'

/** One tap-to-hear tile of the chart. */
export interface ZhuyinTile {
  symbol: string
  pinyin: string
  /** What the sound is like; on a card, the answer side's "meaning". */
  hint: string
  /**
   * What the voice is given. Text-to-speech can't say a bare consonant and may not know the symbols,
   * so this is a character that sounds like the symbol's name: ㄅ is called bo, as 玻. ㄝ and ㄥ have
   * no such character and use their example word.
   */
  speak: string
}

export interface ZhuyinSymbol extends ZhuyinTile {
  /** A common word with this symbol in its zhuyin. */
  example: Example
}

export interface ZhuyinGroup {
  title: string
  note: string
  /** Sounds made in the same place sit in one row: ㄅㄆㄇㄈ with the lips, ㄉㄊㄋㄌ with the tongue tip. */
  rows: readonly (readonly ZhuyinSymbol[])[]
}

/** The 37 symbols, in the order taught in Taiwan: ㄅㄆㄇㄈ… Editing the wording here offers an update to saved cards. */
export const ZHUYIN_GROUPS: readonly ZhuyinGroup[] = [
  {
    title: 'Consonants',
    note: 'They start a syllable. ㄓ ㄔ ㄕ ㄖ ㄗ ㄘ ㄙ can also be a whole syllable alone: 師 is just ㄕ. Their vowel is a soft buzz, not “ee”.',
    rows: [
      [
        { symbol: 'ㄅ', pinyin: 'b', hint: 'Sounds similar to "b" as in "boy"', speak: '玻', example: { hanzi: '爸', pinyin: 'bà', meaning: 'dad' } },
        { symbol: 'ㄆ', pinyin: 'p', hint: 'Sounds similar to "p" as in "pie", with a puff of air', speak: '坡', example: { hanzi: '怕', pinyin: 'pà', meaning: 'to be afraid' } },
        { symbol: 'ㄇ', pinyin: 'm', hint: 'Sounds similar to "m" as in "mom"', speak: '摸', example: { hanzi: '媽', pinyin: 'mā', meaning: 'mom' } },
        { symbol: 'ㄈ', pinyin: 'f', hint: 'Sounds similar to "f" as in "fun"', speak: '佛', example: { hanzi: '飛', pinyin: 'fēi', meaning: 'to fly' } },
      ],
      [
        { symbol: 'ㄉ', pinyin: 'd', hint: 'Sounds similar to "d" as in "dog"', speak: '得', example: { hanzi: '多', pinyin: 'duō', meaning: 'many' } },
        { symbol: 'ㄊ', pinyin: 't', hint: 'Sounds similar to "t" as in "top", with a puff of air', speak: '特', example: { hanzi: '他', pinyin: 'tā', meaning: 'he' } },
        { symbol: 'ㄋ', pinyin: 'n', hint: 'Sounds similar to "n" as in "no"', speak: '訥', example: { hanzi: '你', pinyin: 'nǐ', meaning: 'you' } },
        { symbol: 'ㄌ', pinyin: 'l', hint: 'Sounds similar to "l" as in "love"', speak: '勒', example: { hanzi: '來', pinyin: 'lái', meaning: 'to come' } },
      ],
      [
        { symbol: 'ㄍ', pinyin: 'g', hint: 'Sounds similar to "g" as in "go"', speak: '哥', example: { hanzi: '狗', pinyin: 'gǒu', meaning: 'dog' } },
        { symbol: 'ㄎ', pinyin: 'k', hint: 'Sounds similar to "k" as in "kite", with a puff of air', speak: '科', example: { hanzi: '口', pinyin: 'kǒu', meaning: 'mouth' } },
        { symbol: 'ㄏ', pinyin: 'h', hint: 'Sounds similar to "h" as in "hot", a little rougher', speak: '喝', example: { hanzi: '好', pinyin: 'hǎo', meaning: 'good' } },
      ],
      [
        { symbol: 'ㄐ', pinyin: 'j', hint: 'Sounds similar to "j" as in "jeep", with the tongue flat', speak: '基', example: { hanzi: '家', pinyin: 'jiā', meaning: 'home' } },
        { symbol: 'ㄑ', pinyin: 'q', hint: 'Sounds similar to "ch" as in "cheese", with the tongue flat and a puff of air', speak: '七', example: { hanzi: '去', pinyin: 'qù', meaning: 'to go' } },
        { symbol: 'ㄒ', pinyin: 'x', hint: 'Sounds similar to "sh" as in "she", with the tongue flat', speak: '西', example: { hanzi: '小', pinyin: 'xiǎo', meaning: 'small' } },
      ],
      [
        { symbol: 'ㄓ', pinyin: 'zh', hint: 'Sounds similar to "j" as in "jug", with the tongue curled back', speak: '知', example: { hanzi: '知', pinyin: 'zhī', meaning: 'to know' } },
        { symbol: 'ㄔ', pinyin: 'ch', hint: 'Sounds similar to "ch" as in "church", with the tongue curled back and a puff of air', speak: '吃', example: { hanzi: '吃', pinyin: 'chī', meaning: 'to eat' } },
        { symbol: 'ㄕ', pinyin: 'sh', hint: 'Sounds similar to "sh" as in "shop", with the tongue curled back', speak: '詩', example: { hanzi: '師', pinyin: 'shī', meaning: 'teacher' } },
        { symbol: 'ㄖ', pinyin: 'r', hint: 'Sounds similar to "r" as in "run", close to the "s" in "measure", with the tongue curled back', speak: '日', example: { hanzi: '日', pinyin: 'rì', meaning: 'day, sun' } },
      ],
      [
        { symbol: 'ㄗ', pinyin: 'z', hint: 'Sounds similar to "ds" as in "kids"', speak: '資', example: { hanzi: '字', pinyin: 'zì', meaning: 'character' } },
        { symbol: 'ㄘ', pinyin: 'c', hint: 'Sounds similar to "ts" as in "cats", with a puff of air', speak: '次', example: { hanzi: '次', pinyin: 'cì', meaning: 'time, occurrence' } },
        { symbol: 'ㄙ', pinyin: 's', hint: 'Sounds similar to "s" as in "sun"', speak: '思', example: { hanzi: '四', pinyin: 'sì', meaning: 'four' } },
      ],
    ],
  },
  {
    title: 'Medials',
    note: 'They sit between a consonant and a vowel, or stand alone: ㄐㄧㄚ, ㄧ.',
    rows: [
      [
        { symbol: 'ㄧ', pinyin: 'i / y', hint: 'Sounds similar to "ee" as in "see"', speak: '衣', example: { hanzi: '一', pinyin: 'yī', meaning: 'one' } },
        { symbol: 'ㄨ', pinyin: 'u / w', hint: 'Sounds similar to "oo" as in "too"', speak: '屋', example: { hanzi: '五', pinyin: 'wǔ', meaning: 'five' } },
        { symbol: 'ㄩ', pinyin: 'ü / yu', hint: 'Like "ee" with rounded lips, as the French "u"', speak: '迂', example: { hanzi: '魚', pinyin: 'yú', meaning: 'fish' } },
      ],
    ],
  },
  {
    title: 'Vowels',
    note: 'They end a syllable, or stand alone.',
    rows: [
      [
        { symbol: 'ㄚ', pinyin: 'a', hint: 'Sounds similar to "a" as in "father"', speak: '啊', example: { hanzi: '大', pinyin: 'dà', meaning: 'big' } },
        { symbol: 'ㄛ', pinyin: 'o', hint: 'Sounds similar to "aw" as in "law"', speak: '喔', example: { hanzi: '我', pinyin: 'wǒ', meaning: 'I, me' } },
        { symbol: 'ㄜ', pinyin: 'e', hint: 'Sounds similar to "uh" as in "duh", from the back of the mouth', speak: '鵝', example: { hanzi: '喝', pinyin: 'hē', meaning: 'to drink' } },
        { symbol: 'ㄝ', pinyin: 'ê', hint: 'Sounds similar to "e" as in "yes"; the e of ie and üe', speak: '也', example: { hanzi: '也', pinyin: 'yě', meaning: 'also' } },
      ],
      [
        { symbol: 'ㄞ', pinyin: 'ai', hint: 'Sounds similar to "ie" as in "pie"', speak: '哀', example: { hanzi: '買', pinyin: 'mǎi', meaning: 'to buy' } },
        { symbol: 'ㄟ', pinyin: 'ei', hint: 'Sounds similar to "ay" as in "day"', speak: '欸', example: { hanzi: '給', pinyin: 'gěi', meaning: 'to give' } },
        { symbol: 'ㄠ', pinyin: 'ao', hint: 'Sounds similar to "ow" as in "cow"', speak: '凹', example: { hanzi: '高', pinyin: 'gāo', meaning: 'tall' } },
        { symbol: 'ㄡ', pinyin: 'ou', hint: 'Sounds similar to "o" as in "go"', speak: '歐', example: { hanzi: '手', pinyin: 'shǒu', meaning: 'hand' } },
      ],
      [
        { symbol: 'ㄢ', pinyin: 'an', hint: 'Sounds similar to "an" as in "wander"', speak: '安', example: { hanzi: '看', pinyin: 'kàn', meaning: 'to look' } },
        { symbol: 'ㄣ', pinyin: 'en', hint: 'Sounds similar to "en" as in "taken"', speak: '恩', example: { hanzi: '人', pinyin: 'rén', meaning: 'person' } },
        { symbol: 'ㄤ', pinyin: 'ang', hint: 'Sounds similar to "ong" as in "song"', speak: '昂', example: { hanzi: '忙', pinyin: 'máng', meaning: 'busy' } },
        { symbol: 'ㄥ', pinyin: 'eng', hint: 'Sounds similar to "ung" as in "sung"', speak: '冷', example: { hanzi: '冷', pinyin: 'lěng', meaning: 'cold' } },
      ],
      [{ symbol: 'ㄦ', pinyin: 'er', hint: 'Sounds similar to "ar" as in "car", with the tongue curled', speak: '兒', example: { hanzi: '二', pinyin: 'èr', meaning: 'two' } }],
    ],
  },
]

/** The tone marks, shown on one syllable. They aren't cards: every word shows them. */
export const ZHUYIN_TONES: readonly ZhuyinTile[] = [
  { symbol: 'ㄇㄚ', pinyin: 'mā', hint: '1st tone: high and flat, no mark', speak: '媽' },
  { symbol: 'ㄇㄚˊ', pinyin: 'má', hint: '2nd tone: rising', speak: '麻' },
  { symbol: 'ㄇㄚˇ', pinyin: 'mǎ', hint: '3rd tone: dipping', speak: '馬' },
  { symbol: 'ㄇㄚˋ', pinyin: 'mà', hint: '4th tone: falling', speak: '罵' },
  // A neutral tone only exists after another syllable, and alone 嗎 may be read má.
  { symbol: '˙ㄇㄚ', pinyin: 'ma', hint: 'Neutral tone: light and short, marked in front, like the end of 媽媽', speak: '媽媽' },
]

export const ZHUYIN_SYMBOLS: readonly ZhuyinSymbol[] = ZHUYIN_GROUPS.flatMap((group) => group.rows.flat())

const BY_SYMBOL = new Map(ZHUYIN_SYMBOLS.map((s, order) => [s.symbol, { ...s, order }]))

/** The symbol a card teaches, if it is a symbol card: its front is the symbol itself. */
export function symbolInfo(hanzi: string): ZhuyinSymbol | undefined {
  return BY_SYMBOL.get(hanzi)
}

/** Where a card comes in the symbols' teaching order; anything else comes after all of them. */
export function symbolOrder(hanzi: string): number {
  return BY_SYMBOL.get(hanzi)?.order ?? ZHUYIN_SYMBOLS.length
}

/** What the voice says for a card. */
export function spokenText(card: Pick<Card, 'hanzi'>): string {
  return symbolInfo(card.hanzi)?.speak ?? card.hanzi
}

function isOutdated(card: Card, { pinyin, hint, example }: ZhuyinSymbol): boolean {
  const saved = card.example
  return card.pinyin !== pinyin || card.meaning !== hint || saved?.hanzi !== example.hanzi || saved.pinyin !== example.pinyin || saved.meaning !== example.meaning
}

/** Symbol cards saved with other wording than the table's: cards keep the text they were made with. */
export function outdatedSymbolCards(cards: readonly Card[]): Card[] {
  return cards.filter((card) => {
    const symbol = symbolInfo(card.hanzi)
    return symbol !== undefined && card.tags.includes(ZHUYIN_TAG) && isOutdated(card, symbol)
  })
}
