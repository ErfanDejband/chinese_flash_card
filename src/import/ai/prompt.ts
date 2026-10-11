/**
 * Instructions for extracting study items from one page image. Bump PROMPT_VERSION whenever the
 * wording or schema changes, so stored page results can be traced to the prompt that produced them.
 */
export const PROMPT_VERSION = 2

export const SYSTEM_PROMPT = `You extract study material from ONE page image of a Mandarin Chinese course for an English-speaking learner in Taiwan. The image may be a scan, a screenshot or a phone photo of a printed page; photos can be tilted, curved or shadowed, so read characters and tone marks carefully. Reply with JSON only.

Find every item a learner should memorise:
1. A picture with a pinyin label (the Chinese characters may be missing).
2. A vocabulary slide or flashcard (often titled 生詞): characters, pinyin, part of speech, English meaning, picture.
3. Words listed in a table or list with their pinyin (with or without pictures).
4. Complete example sentences shown on the page: return each as its own item of kind "sentence".

Ignore: page headers and footers, logos, image credits (e.g. "by ... from Flaticon"), lesson titles, instructions, exercise prompts, isolated syllables or pinyin initials/finals being drilled (e.g. "yang", "iang", "zh", "wu"), tone-mark rules and grammar explanations. If the page has nothing to memorise, return {"items": []}.

For each item:
- kind: "word" or "sentence".
- hanzi: Traditional Chinese characters as used in Taiwan. Copy them exactly if printed. If the page shows only pinyin (and maybe a picture), write the word that matches BOTH the pinyin and the picture, and set hanziSource to "inferred". Never use Simplified characters.
- pinyin: Hanyu Pinyin with tone marks, in the standard written form. If a table also shows a spoken / tone-sandhi row, use the written row. Join the syllables of one word without spaces (lǎoshī); keep spaces between the words of a sentence. The neutral tone has no mark. If no pinyin is printed, give the standard pinyin and set pinyinSource to "inferred".
- meaning: short English meaning (1-6 words; for a sentence, a natural translation). Use the printed English if present, otherwise write one and set meaningSource to "inferred".
- partOfSpeech: as printed (e.g. "N", "V", "Vst", "M"), otherwise "".
- notes: other printed text that helps learn the item (related words, measure word), otherwise "".
- imageBox: the bounding box of the picture that illustrates THIS item only (not its text label, not the whole slide), as [ymin, xmin, ymax, xmax] normalised to 0-1000 relative to the page image. Use null if the item has no picture of its own.
- confidence: a number from 0 to 1: how sure you are that hanzi and pinyin are correct.

List items in reading order (top to bottom, left to right). Do not repeat an item that appears twice on the same page.`

/** The JSON shape, spelled out for providers without native schema support. */
export const JSON_SHAPE = `Reply with a JSON object of exactly this shape:
{"items":[{"kind":"word","hanzi":"老師","pinyin":"lǎoshī","meaning":"teacher","partOfSpeech":"N","notes":"","hanziSource":"printed","pinyinSource":"printed","meaningSource":"printed","imageBox":[120,540,480,900],"confidence":0.95}]}`

export function userPrompt(textHint: string): string {
  const hint = textHint.trim() || '(none)'
  return `Extract the study items from this page.

Text found in the PDF's text layer (accurate where present, but may be incomplete or empty; text inside pictures is not included):
"""
${hint}
"""`
}

/** Gemini `responseSchema` (OpenAPI subset). */
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: ['word', 'sentence'] },
          hanzi: { type: 'STRING' },
          pinyin: { type: 'STRING' },
          meaning: { type: 'STRING' },
          partOfSpeech: { type: 'STRING' },
          notes: { type: 'STRING' },
          hanziSource: { type: 'STRING', enum: ['printed', 'inferred'] },
          pinyinSource: { type: 'STRING', enum: ['printed', 'inferred'] },
          meaningSource: { type: 'STRING', enum: ['printed', 'inferred'] },
          imageBox: { type: 'ARRAY', items: { type: 'INTEGER' }, nullable: true },
          confidence: { type: 'NUMBER' },
        },
        required: ['kind', 'hanzi', 'pinyin', 'meaning', 'hanziSource', 'pinyinSource', 'meaningSource', 'imageBox', 'confidence'],
        propertyOrdering: [
          'kind',
          'hanzi',
          'pinyin',
          'meaning',
          'partOfSpeech',
          'notes',
          'hanziSource',
          'pinyinSource',
          'meaningSource',
          'imageBox',
          'confidence',
        ],
      },
    },
  },
  required: ['items'],
} as const

/**
 * The same item schema as standard JSON Schema, for Claude's structured outputs
 * (`output_config.format`): every object needs `additionalProperties: false`, and numeric
 * constraints are not supported (ranges are enforced by validation instead).
 */
export const JSON_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['word', 'sentence'] },
          hanzi: { type: 'string' },
          pinyin: { type: 'string' },
          meaning: { type: 'string' },
          partOfSpeech: { type: 'string' },
          notes: { type: 'string' },
          hanziSource: { type: 'string', enum: ['printed', 'inferred'] },
          pinyinSource: { type: 'string', enum: ['printed', 'inferred'] },
          meaningSource: { type: 'string', enum: ['printed', 'inferred'] },
          imageBox: { anyOf: [{ type: 'array', items: { type: 'integer' } }, { type: 'null' }] },
          confidence: { type: 'number' },
        },
        required: [
          'kind',
          'hanzi',
          'pinyin',
          'meaning',
          'partOfSpeech',
          'notes',
          'hanziSource',
          'pinyinSource',
          'meaningSource',
          'imageBox',
          'confidence',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
}

/** A prompt with its reply schema, in the forms each provider needs. */
export interface JsonTask {
  id: string
  /** Stored with each page so its result can be traced to the prompt that produced it. */
  version: number
  system: string
  /** The user message for one page; `textHint` is the PDF text layer ('' for photos). */
  user(textHint: string): string
  /** The JSON shape, spelled out for providers without native schema support. */
  jsonShape: string
  /** Gemini `responseSchema` (OpenAPI subset). */
  geminiSchema: Record<string, unknown>
  /** Standard JSON Schema for Claude's structured outputs. */
  jsonSchema: Record<string, unknown>
}

/** Course pages: vocabulary slides, word lists, pictures with labels, example sentences. */
export const VOCAB_TASK: JsonTask = {
  id: 'vocabulary',
  version: PROMPT_VERSION,
  system: SYSTEM_PROMPT,
  user: userPrompt,
  jsonShape: JSON_SHAPE,
  geminiSchema: GEMINI_RESPONSE_SCHEMA,
  jsonSchema: JSON_RESPONSE_SCHEMA,
}

/** Bump whenever the reading prompt's wording or schema changes. */
export const READING_PROMPT_VERSION = 1

export const READING_SYSTEM_PROMPT = `You read ONE page of a Chinese children's book or graded reader for an English-speaking learner in Taiwan, and split its sentences into words. The image may be a scan, a screenshot or a phone photo; photos can be tilted, curved or shadowed, so read every character carefully. Reply with JSON only.

The text is Traditional Chinese as used in Taiwan. Children's books often print zhuyin (bopomofo: ㄅㄆㄇㄈ… with the tone marks ˊ ˇ ˋ ˙) beside or above each character. Zhuyin is a reading aid, not part of the text: never copy zhuyin symbols into any field. Use it to choose the reading of characters that have more than one (了, 還, 著, 長, 得, 地, 行, 重, 為, 都, 樂 …).

Return every sentence of the story text, in reading order (books may run top to bottom in columns from right to left). Speech bubbles count as story text. Ignore the book title, page numbers, headers, publisher text and labels that are not part of the story.

For each sentence:
- text: the sentence exactly as printed, in Traditional characters, with its punctuation. Never use Simplified characters.
- pinyin: Hanyu Pinyin with tone marks for the whole sentence, with spaces between words.
- meaning: a natural English translation.
- words: the sentence split into words, in order, so that the words joined together give the sentence without its punctuation and spaces. Use natural dictionary words (一起, 公園, 散步; set phrases like 跑來跑去 may stay one word), not single characters, unless the character is a word on its own.

For each word:
- hanzi: the word's characters, exactly as in the sentence.
- pinyin: Hanyu Pinyin with tone marks, syllables joined without spaces (gōngyuán), using the reading this sentence needs. Write the dictionary tones of 一 and 不 (yī, bù), not their tone-sandhi forms. The neutral tone has no mark.
- meaning: a short English meaning as used in this sentence (1-6 words).
- role: "name" for names of people, animals or places (小明); "function" for grammatical particles (的, 了, 嗎, 呢, 吧, 啊, 地, 得, 著); "number" for numbers, dates and counts; otherwise "word".
- confidence: a number from 0 to 1: how sure you are that the characters and pinyin are correct.

If the page has no story text, return {"sentences": []}.`

export const READING_JSON_SHAPE = `Reply with a JSON object of exactly this shape:
{"sentences":[{"text":"小明和媽媽去公園。","pinyin":"Xiǎomíng hé māma qù gōngyuán.","meaning":"Xiaoming goes to the park with Mom.","words":[{"hanzi":"小明","pinyin":"Xiǎomíng","meaning":"Xiaoming (a name)","role":"name","confidence":0.95},{"hanzi":"和","pinyin":"hé","meaning":"and, with","role":"word","confidence":0.95},{"hanzi":"媽媽","pinyin":"māma","meaning":"mom","role":"word","confidence":0.95},{"hanzi":"去","pinyin":"qù","meaning":"to go","role":"word","confidence":0.95},{"hanzi":"公園","pinyin":"gōngyuán","meaning":"park","role":"word","confidence":0.95}]}]}`

export function readingUserPrompt(textHint: string): string {
  const hint = textHint.trim() || '(none)'
  return `Split the sentences on this page into words.

Text found in the PDF's text layer (accurate where present, but may be incomplete or empty, and zhuyin may be mixed in with the characters):
"""
${hint}
"""`
}

const ROLES = ['word', 'name', 'function', 'number']

export const READING_GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sentences: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          pinyin: { type: 'STRING' },
          meaning: { type: 'STRING' },
          words: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                hanzi: { type: 'STRING' },
                pinyin: { type: 'STRING' },
                meaning: { type: 'STRING' },
                role: { type: 'STRING', enum: ROLES },
                confidence: { type: 'NUMBER' },
              },
              required: ['hanzi', 'pinyin', 'meaning', 'role', 'confidence'],
              propertyOrdering: ['hanzi', 'pinyin', 'meaning', 'role', 'confidence'],
            },
          },
        },
        required: ['text', 'pinyin', 'meaning', 'words'],
        propertyOrdering: ['text', 'pinyin', 'meaning', 'words'],
      },
    },
  },
  required: ['sentences'],
} as const

export const READING_JSON_SCHEMA = {
  type: 'object',
  properties: {
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          pinyin: { type: 'string' },
          meaning: { type: 'string' },
          words: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                hanzi: { type: 'string' },
                pinyin: { type: 'string' },
                meaning: { type: 'string' },
                role: { type: 'string', enum: ROLES },
                confidence: { type: 'number' },
              },
              required: ['hanzi', 'pinyin', 'meaning', 'role', 'confidence'],
              additionalProperties: false,
            },
          },
        },
        required: ['text', 'pinyin', 'meaning', 'words'],
        additionalProperties: false,
      },
    },
  },
  required: ['sentences'],
  additionalProperties: false,
}

/** Story pages: every sentence split into words, each with its reading in context. */
export const READING_TASK: JsonTask = {
  id: 'reading',
  version: READING_PROMPT_VERSION,
  system: READING_SYSTEM_PROMPT,
  user: readingUserPrompt,
  jsonShape: READING_JSON_SHAPE,
  geminiSchema: READING_GEMINI_SCHEMA,
  jsonSchema: READING_JSON_SCHEMA,
}
