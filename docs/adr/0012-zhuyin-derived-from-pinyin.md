# ADR 0012: Zhuyin is worked out from pinyin, never stored

**Status:** accepted (2026-11-04).

## Context

The user studies in Taiwan and wanted zhuyin (bopomofo) on cards, with a setting for pinyin, zhuyin or both, and a set of
cards to learn the 37 symbols. Cards hold one `pinyin` string, usually with a word's syllables joined (`lǎoshī`). No
dependency converts to zhuyin, and pinyin-pro has no zhuyin support.

## Options considered

- **Store zhuyin on each card:** needs a backfill of every existing card, which touches `updatedAt` and so sends the whole
  deck through sync; every writer (import, word lists, Snap, the form) must keep two fields in step.
- **Convert from the characters with the dictionary when shown:** ignores the card's own pinyin (polyphonic characters,
  the user's corrections), and pulls pinyin-pro's 289 KB chunk into every screen that shows a card.
- **Convert from the stored pinyin when shown:** no data change, and pinyin stays the one source. The catch is that a
  joined word can split two ways: `fāngàn` is `fāng+àn` (方案) or `fān+gàn`, and `suggestPinyin` drops the apostrophe that
  would mark it.

## Decision

**Convert from the stored pinyin when shown** (`domain/pinyin/zhuyin.ts`, `toZhuyin(pinyin, hanzi?)`).

- The card's characters settle a joined word. Only 451 characters in the CJK block have a reading that starts with a
  vowel, about 1.3 KB (`zhuyinData.ts`, compared with the dictionary by a test). Inside a word, a syllable must start with
  a vowel exactly when its character can. Over 298,794 random 2–3 character words, all split correctly; without the
  characters, 1,732 of them went wrong.
- With no characters, it follows the spelling rule that an apostrophe marks such a syllable. An apostrophe always splits,
  so a wrong split can be fixed by hand.
- It returns null for anything that isn't pinyin, and the UI then shows the pinyin: never half-converted text.
- The file must not import pinyin-pro or `suggest.ts`.

**The setting is per device**, like the theme (`lib/readingPref.ts`). `<Reading>` sits in list rows of up to 100 cards, and
a synced setting would need a live query per row or a new app-wide store, and would show pinyin briefly while it loads.

**Symbol cards are ordinary `Card` rows recognised by their symbol** (`symbolInfo(card.hanzi)`), so `Card` gets no new
field that an edit could lose. `hanzi` is the symbol, `pinyin` the pinyin, `meaning` the "sounds similar to" hint.

- The front is always the symbol, whatever the direction; the default direction would otherwise ask with the hint.
- They lead the new-card queue, in the ㄅㄆㄇㄈ order taught in Taiwan, within the daily limit (`newCardPool`).
- **Sound:** the voice gets a stand-in character, `spokenText(card)`. Text-to-speech can't say a bare consonant and may not
  know the symbols, so ㄅ is spoken as 玻 (bō), which is how ㄅ is named in class. ㄝ and ㄥ have no such character and use
  their example word. No recordings with a clear licence were found.

## Consequences

- Every card has zhuyin at once. No migration; sync and backups are unchanged.
- Zhuyin follows the stored pinyin, so where Taiwan's standard reading differs (垃圾 lèsè, 星期 qí) a dictionary-filled card
  shows the mainland reading until its pinyin is edited.
- Pinyin stays the only input: the edit forms show a zhuyin preview under the field.
- Random card ids mean adding the deck on two devices before they sync gives duplicates. Removing then re-adding starts
  progress over.
- An older build shows symbol cards as plain cards, with the hint on the front.
- Stand-in sounds depend on the device's voice, which tests can't judge: they have to be checked by ear on a phone.

## Follow-up (2026-11-04)

- **Order:** the first release used the Dong Chinese lesson order. The user found the ㄅㄆㄇㄈ order easier, with consonants
  and vowels apart, so the table became `ZHUYIN_GROUPS` (consonants, medials, vowels). `newCardPool` sorts by that table, not
  by `createdAt`, so cards already added follow it with no data change.
- **Saved wording:** a symbol card keeps the text it was made with, so a better hint in the table doesn't reach it.
  `outdatedSymbolCards` finds these and Settings offers "Update N cards". Progress is stored apart, so it stays.
- **Taiwan readings:** to keep the mainland readings above out of new cards, the AI prompts now ask for Taiwan's reading
  when no reading is printed (`TAIWAN_READING`). The dictionary doesn't know these readings (only 垃圾 lājī), so
  `checkPinyin` got a per-character table, `TAIWAN_READINGS`, or a correct `lèsè` would be flagged as wrong. It can't feed the
  dictionary fill: most of these readings apply only in some words (法 is fǎ in most, fà in 法國).
