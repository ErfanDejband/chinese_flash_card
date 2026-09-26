/**
 * Hand-written model replies modelled on real course pages (not imported by app code).
 * Book 2 p5: pictures labelled only with pinyin → characters inferred.
 * Book 3 p20: 生詞 slide with printed characters, pinyin and meaning.
 */
export const BOOK2_P5_REPLY = JSON.stringify({
  items: [
    { kind: 'word', hanzi: '牙', pinyin: 'yá', meaning: 'tooth', partOfSpeech: '', notes: '', hanziSource: 'inferred', pinyinSource: 'printed', meaningSource: 'inferred', imageBox: [120, 230, 330, 480], confidence: 0.9 },
    { kind: 'word', hanzi: '鴨子', pinyin: 'yā zi', meaning: 'duck', partOfSpeech: '', notes: '', hanziSource: 'inferred', pinyinSource: 'printed', meaningSource: 'inferred', imageBox: [110, 700, 330, 900], confidence: 0.92 },
    { kind: 'word', hanzi: '家', pinyin: 'jiā', meaning: 'home', partOfSpeech: '', notes: '', hanziSource: 'inferred', pinyinSource: 'printed', meaningSource: 'inferred', imageBox: [520, 200, 760, 470], confidence: 0.85 },
    { kind: 'word', hanzi: '蝦', pinyin: 'xiā', meaning: 'shrimp', partOfSpeech: '', notes: '', hanziSource: 'inferred', pinyinSource: 'printed', meaningSource: 'inferred', imageBox: [540, 690, 830, 870], confidence: 0.88 },
  ],
})

export const BOOK3_P20_REPLY =
  '```json\n' +
  JSON.stringify({
    items: [
      { kind: 'word', hanzi: '老師', pinyin: 'lǎoshī', meaning: 'teacher', partOfSpeech: 'N', notes: '', hanziSource: 'printed', pinyinSource: 'printed', meaningSource: 'printed', imageBox: [330, 600, 820, 860], confidence: 0.97 },
    ],
  }) +
  '\n```'
