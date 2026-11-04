import type { Card, Example } from './types'

/** Tag on the symbol cards added from Settings → Study. */
export const ZHUYIN_TAG = 'zhuyin'

export interface ZhuyinSymbol {
  symbol: string
  pinyin: string
  /** The answer side's "meaning": what the sound is like. */
  hint: string
  /**
   * What the voice is given. Text-to-speech can't say a bare consonant and may not know the symbols,
   * so this is a character that sounds like the symbol's name: ㄅ is called bo, as 玻. ㄝ and ㄥ have
   * no such character and use their example word.
   */
  speak: string
  /** A common word with this symbol in its zhuyin. */
  example: Example
}

/** The 37 symbols in lesson order: each lesson's sounds combine into words with the earlier ones. */
export const ZHUYIN_LESSONS: readonly (readonly ZhuyinSymbol[])[] = [
  [
    { symbol: 'ㄅ', pinyin: 'b', hint: 'Sounds similar to "b" as in "boy"', speak: '玻', example: { hanzi: '爸', pinyin: 'bà', meaning: 'dad' } },
    { symbol: 'ㄆ', pinyin: 'p', hint: 'Sounds similar to "p" as in "pie", with a puff of air', speak: '坡', example: { hanzi: '怕', pinyin: 'pà', meaning: 'to be afraid' } },
    { symbol: 'ㄇ', pinyin: 'm', hint: 'Sounds similar to "m" as in "mom"', speak: '摸', example: { hanzi: '媽', pinyin: 'mā', meaning: 'mom' } },
    { symbol: 'ㄚ', pinyin: 'a', hint: 'Sounds similar to "a" as in "father"', speak: '啊', example: { hanzi: '大', pinyin: 'dà', meaning: 'big' } },
    { symbol: 'ㄧ', pinyin: 'i, yi', hint: 'Sounds similar to "ee" as in "see"', speak: '衣', example: { hanzi: '一', pinyin: 'yī', meaning: 'one' } },
  ],
  [
    { symbol: 'ㄋ', pinyin: 'n', hint: 'Sounds similar to "n" as in "no"', speak: '訥', example: { hanzi: '你', pinyin: 'nǐ', meaning: 'you' } },
    { symbol: 'ㄈ', pinyin: 'f', hint: 'Sounds similar to "f" as in "fun"', speak: '佛', example: { hanzi: '飛', pinyin: 'fēi', meaning: 'to fly' } },
    { symbol: 'ㄢ', pinyin: 'an', hint: 'Sounds similar to "an" as in "wander"', speak: '安', example: { hanzi: '看', pinyin: 'kàn', meaning: 'to look' } },
    { symbol: 'ㄣ', pinyin: 'en', hint: 'Sounds similar to "en" as in "taken"', speak: '恩', example: { hanzi: '人', pinyin: 'rén', meaning: 'person' } },
  ],
  [
    { symbol: 'ㄏ', pinyin: 'h', hint: 'Sounds similar to "h" as in "hot", a little rougher', speak: '喝', example: { hanzi: '好', pinyin: 'hǎo', meaning: 'good' } },
    { symbol: 'ㄉ', pinyin: 'd', hint: 'Sounds similar to "d" as in "dog"', speak: '得', example: { hanzi: '多', pinyin: 'duō', meaning: 'many' } },
    { symbol: 'ㄊ', pinyin: 't', hint: 'Sounds similar to "t" as in "top", with a puff of air', speak: '特', example: { hanzi: '他', pinyin: 'tā', meaning: 'he' } },
    { symbol: 'ㄜ', pinyin: 'e', hint: 'Sounds similar to "uh" as in "duh", from the back of the mouth', speak: '鵝', example: { hanzi: '喝', pinyin: 'hē', meaning: 'to drink' } },
    { symbol: 'ㄠ', pinyin: 'ao', hint: 'Sounds similar to "ow" as in "cow"', speak: '凹', example: { hanzi: '高', pinyin: 'gāo', meaning: 'tall' } },
  ],
  [
    { symbol: 'ㄍ', pinyin: 'g', hint: 'Sounds similar to "g" as in "go"', speak: '哥', example: { hanzi: '狗', pinyin: 'gǒu', meaning: 'dog' } },
    { symbol: 'ㄎ', pinyin: 'k', hint: 'Sounds similar to "k" as in "kite", with a puff of air', speak: '科', example: { hanzi: '口', pinyin: 'kǒu', meaning: 'mouth' } },
    { symbol: 'ㄡ', pinyin: 'ou', hint: 'Sounds similar to "o" as in "go"', speak: '歐', example: { hanzi: '手', pinyin: 'shǒu', meaning: 'hand' } },
    { symbol: 'ㄨ', pinyin: 'u, wu', hint: 'Sounds similar to "oo" as in "too"', speak: '屋', example: { hanzi: '五', pinyin: 'wǔ', meaning: 'five' } },
    { symbol: 'ㄛ', pinyin: 'o', hint: 'Sounds similar to "aw" as in "law"', speak: '喔', example: { hanzi: '我', pinyin: 'wǒ', meaning: 'I, me' } },
  ],
  [
    { symbol: 'ㄌ', pinyin: 'l', hint: 'Sounds similar to "l" as in "love"', speak: '勒', example: { hanzi: '來', pinyin: 'lái', meaning: 'to come' } },
    { symbol: 'ㄤ', pinyin: 'ang', hint: 'Sounds similar to "ong" as in "song"', speak: '昂', example: { hanzi: '忙', pinyin: 'máng', meaning: 'busy' } },
    { symbol: 'ㄥ', pinyin: 'eng', hint: 'Sounds similar to "ung" as in "sung"', speak: '冷', example: { hanzi: '冷', pinyin: 'lěng', meaning: 'cold' } },
    { symbol: 'ㄞ', pinyin: 'ai', hint: 'Sounds similar to "ie" as in "pie"', speak: '哀', example: { hanzi: '買', pinyin: 'mǎi', meaning: 'to buy' } },
    { symbol: 'ㄟ', pinyin: 'ei', hint: 'Sounds similar to "ay" as in "day"', speak: '欸', example: { hanzi: '給', pinyin: 'gěi', meaning: 'to give' } },
  ],
  [
    { symbol: 'ㄩ', pinyin: 'ü, yu', hint: 'Like "ee" with rounded lips', speak: '迂', example: { hanzi: '魚', pinyin: 'yú', meaning: 'fish' } },
    { symbol: 'ㄝ', pinyin: 'ê', hint: 'Sounds similar to "e" as in "yes"; the e of ie and üe', speak: '也', example: { hanzi: '也', pinyin: 'yě', meaning: 'also' } },
    { symbol: 'ㄦ', pinyin: 'er', hint: 'Sounds similar to "ar" as in "car", with the tongue curled', speak: '兒', example: { hanzi: '二', pinyin: 'èr', meaning: 'two' } },
  ],
  [
    { symbol: 'ㄐ', pinyin: 'j', hint: 'Sounds similar to "j" as in "jeep", with the tongue flat', speak: '基', example: { hanzi: '家', pinyin: 'jiā', meaning: 'home' } },
    { symbol: 'ㄑ', pinyin: 'q', hint: 'Sounds similar to "ch" as in "cheese", with the tongue flat', speak: '七', example: { hanzi: '去', pinyin: 'qù', meaning: 'to go' } },
    { symbol: 'ㄒ', pinyin: 'x', hint: 'Sounds similar to "sh" as in "she", with the tongue flat', speak: '西', example: { hanzi: '小', pinyin: 'xiǎo', meaning: 'small' } },
  ],
  [
    { symbol: 'ㄗ', pinyin: 'z', hint: 'Sounds similar to "ds" as in "kids"', speak: '資', example: { hanzi: '字', pinyin: 'zì', meaning: 'character' } },
    { symbol: 'ㄘ', pinyin: 'c', hint: 'Sounds similar to "ts" as in "cats"', speak: '次', example: { hanzi: '菜', pinyin: 'cài', meaning: 'vegetable' } },
    { symbol: 'ㄙ', pinyin: 's', hint: 'Sounds similar to "s" as in "sun"', speak: '思', example: { hanzi: '三', pinyin: 'sān', meaning: 'three' } },
  ],
  [
    { symbol: 'ㄓ', pinyin: 'zh', hint: 'Sounds similar to "j" as in "jug", with the tongue curled back', speak: '知', example: { hanzi: '中', pinyin: 'zhōng', meaning: 'middle' } },
    { symbol: 'ㄔ', pinyin: 'ch', hint: 'Sounds similar to "ch" as in "church", with the tongue curled back', speak: '吃', example: { hanzi: '茶', pinyin: 'chá', meaning: 'tea' } },
    { symbol: 'ㄕ', pinyin: 'sh', hint: 'Sounds similar to "sh" as in "shop", with the tongue curled back', speak: '詩', example: { hanzi: '山', pinyin: 'shān', meaning: 'mountain' } },
    { symbol: 'ㄖ', pinyin: 'r', hint: 'Sounds similar to "r" as in "run", with the tongue curled back', speak: '日', example: { hanzi: '肉', pinyin: 'ròu', meaning: 'meat' } },
  ],
]

export const ZHUYIN_SYMBOLS: readonly ZhuyinSymbol[] = ZHUYIN_LESSONS.flat()

const BY_SYMBOL = new Map(ZHUYIN_SYMBOLS.map((s) => [s.symbol, s]))

/** The symbol a card teaches, if it is a symbol card: its front is the symbol itself. */
export function symbolInfo(hanzi: string): ZhuyinSymbol | undefined {
  return BY_SYMBOL.get(hanzi)
}

/** What the voice says for a card. */
export function spokenText(card: Pick<Card, 'hanzi'>): string {
  return symbolInfo(card.hanzi)?.speak ?? card.hanzi
}
