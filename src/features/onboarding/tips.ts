/** A word taught alongside the help: tips and the checklist each carry one, with "+ add". */
export interface HelpWord {
  hanzi: string
  pinyin: string
  meaning: string
}

export type TipId = 'review-start' | 'review-answer' | 'review-done' | 'import-pages' | 'import-drafts' | 'progress' | 'pictures'

export interface TipContent {
  body: string
  word: HelpWord
  /** Help topic behind "More" (not on the review screen, which would end the session). */
  topic?: string
}

/** Tips shown once each, the first time a screen or moment comes up. */
export const TIPS: Record<TipId, TipContent> = {
  'review-start': {
    body: 'Answer in your head first (out loud is even better), then tap Show answer.',
    word: { hanzi: '想', pinyin: 'xiǎng', meaning: 'to think' },
  },
  'review-answer': {
    body: 'Be honest: Knew moves the card up a box. Forgot sends it back down, and you see it again before the session ends.',
    word: { hanzi: '忘了', pinyin: 'wàngle', meaning: 'forgot' },
  },
  'review-done': {
    body: 'Each card now rests in its box until it is due. Come back tomorrow to keep your streak going.',
    word: { hanzi: '明天', pinyin: 'míngtiān', meaning: 'tomorrow' },
  },
  'import-pages': {
    body: 'Pick only the pages with words to learn: each page is one AI request. Vocabulary is for word lists and slides; Reading splits story sentences into words.',
    word: { hanzi: '閱讀', pinyin: 'yuèdú', meaning: 'to read' },
    topic: 'import',
  },
  'import-drafts': {
    body: 'Nothing is added yet. Check each card, fix what is wrong, untick what you don’t want, then add them. Flags mark what is worth a look.',
    word: { hanzi: '檢查', pinyin: 'jiǎnchá', meaning: 'to check' },
    topic: 'import',
  },
  progress: {
    body: 'The streak counts the days in a row you reviewed; the calendar fills in as you go.',
    word: { hanzi: '進步', pinyin: 'jìnbù', meaning: 'progress' },
    topic: 'progress',
  },
  pictures: {
    body: 'Keep the pictures that show the meaning clearly. Adjust moves the crop; untick the ones you don’t like.',
    word: { hanzi: '圖片', pinyin: 'túpiàn', meaning: 'picture' },
    topic: 'pictures',
  },
}

export const TIP_IDS = Object.keys(TIPS) as TipId[]

/** The label on every tip. */
export const TIP_WORD: HelpWord = { hanzi: '小提示', pinyin: 'xiǎo tíshì', meaning: 'tip' }

/** The checklist's title. */
export const CHECKLIST_WORD: HelpWord = { hanzi: '開始', pinyin: 'kāishǐ', meaning: 'to begin' }
