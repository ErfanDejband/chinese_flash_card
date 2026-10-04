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
