/** Tag on cards the app added for trying it out; Home offers to remove or keep them. */
export const SAMPLE_TAG = 'sample'

export interface SampleWord {
  hanzi: string
  pinyin: string
  meaning: string
  /** Drawn as the card's picture. */
  emoji: string
}

/** Ten everyday words for trying the app without typing anything ("Just let me try it" on the welcome screen). */
export const SAMPLE_WORDS: readonly SampleWord[] = [
  { hanzi: '你好', pinyin: 'nǐhǎo', meaning: 'hello', emoji: '👋' },
  { hanzi: '貓', pinyin: 'māo', meaning: 'cat', emoji: '🐱' },
  { hanzi: '狗', pinyin: 'gǒu', meaning: 'dog', emoji: '🐶' },
  { hanzi: '水', pinyin: 'shuǐ', meaning: 'water', emoji: '💧' },
  { hanzi: '茶', pinyin: 'chá', meaning: 'tea', emoji: '🍵' },
  { hanzi: '書', pinyin: 'shū', meaning: 'book', emoji: '📖' },
  { hanzi: '蘋果', pinyin: 'píngguǒ', meaning: 'apple', emoji: '🍎' },
  { hanzi: '太陽', pinyin: 'tàiyáng', meaning: 'sun', emoji: '☀️' },
  { hanzi: '吃', pinyin: 'chī', meaning: 'to eat', emoji: '🍽️' },
  { hanzi: '喝', pinyin: 'hē', meaning: 'to drink', emoji: '🥤' },
]
