# ADR 0008: Reading pages and the known-words list

**Status:** accepted (2026-10-11). Extends [ADR 0005](0005-ai-pdf-extraction.md).

## Context

The import prompt was written for course pages: vocabulary slides, word lists and pictures with labels. The learner
also reads simple children's books (Traditional characters with zhuyin), where each page has a few sentences. They want
the words they don't know from those sentences as cards. Two problems:

- The course prompt returns a whole sentence as one item. It doesn't split it into words.
- Every import would suggest the same easy words again (我, 是, 的). Only words that are already cards were switched off.

## Options considered

- **One prompt that detects the page type.** Rejected. Detection mistakes would split a vocabulary page into words, or
  the reverse, and the user would have no say.
- **The AI only transcribes the text; the app splits words and looks up meanings offline** (Chrome's `Intl.Segmenter`
  or pinyin-pro `segment`, plus CC-CEDICT). Rejected:
  - On test sentences the segmenter gave 一起去 and 他想, and pinyin-pro split Traditional text into single characters.
  - Offline meanings ignore context.
- **Two passes** (transcribe, the user taps unknown words, then a second call fills in only those). Rejected. It means
  two waits per page, and the saving is small because a page is one request either way.
- **A "Reading page" mode with its own prompt, and a sentence reader in the review.** Chosen.

## Decision

- **Mode:** `ImportRecord.mode: 'vocabulary' | 'reading'`, chosen in the page picker. The last choice is remembered
  on the device. A resumed run reads the mode from the record.
- **Prompts as tasks:** `JsonTask` in `src/import/ai/prompt.ts` holds the system prompt, the user message, the JSON
  shape and both schemas (Gemini, Claude). The adapters read `PageRequest.task`.
  - `VOCAB_TASK` is the old prompt, unchanged at v2.
  - `READING_TASK` is v1. The page stores the version of the prompt that produced it.
  - The image is optional, so the same adapters can make text-only requests later.
- **Reading prompt:**
  - Read the characters only. Use zhuyin to choose the reading of characters with more than one, and never copy zhuyin
    into a field. `stripZhuyin` also removes any that slip through.
  - Return sentences in reading order, each split into natural words that cover the sentence. Each word has pinyin in
    context, a meaning in context and a `role`: word, name, function (particle) or number.
- **Post-processing** (`src/import/extract/reading.ts`, pure):
  - `alignSentence` matches the words to the printed sentence for the reader. Gaps hold punctuation. Words that skip
    or invent characters set `mismatch`.
  - **One draft per new word across the whole import**:
    - words already in the deck get no draft and show ✓ in the reader;
    - later occurrences link to the first draft through their characters.
  - Names, particles, numbers and known words get a flag and start switched off.
  - Each draft keeps its first sentence as `example`.
- **Reading pinyin:** it comes from zhuyin or from the model, so it isn't flagged as "inferred". The pinyin check stays
  as the safety net. It now accepts any dictionary reading of a polyphonic character (還 hái/huán, 了 le/liǎo, 長
  cháng/zhǎng) through pinyin-pro `polyphonic`, so readings that are right for their sentence aren't flagged.
- **`Card.example: { hanzi, pinyin, meaning }`:** non-indexed, so no schema version. It syncs and backs up with the
  card, shows on the answer side with the word highlighted, and can be edited in the card editor.
- **Known words:**
  - Stored in Dexie v4 `knownWords` (id = the characters). Removal is a soft delete, so sync can carry it.
  - Synced as `known.json.gz` with last write wins per row. Older app versions ignore files they don't know, so the
    sync format version is unchanged.
  - Backed up as an optional `knownWords.json`. Older backups still restore.
  - "I know this" on a draft (in either mode) adds the word. Settings → Known words lists, adds and removes words.
  - The `known` flag switches a draft off in both modes.

## Consequences

- A reading page costs one request, like any page.
- The reader keeps the review short: words being added get full cards (for checking pinyin and meaning), and words
  left out are one tap away in their sentence.
- Words the learner left out but didn't mark as known will be suggested again by later imports. That's on purpose:
  only "I know this" is remembered.
- Reading words have no picture. Phase 11 adds pictures for cards that have none.
