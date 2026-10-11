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

/** A reading page (kids' book with zhuyin): three sentences split into words. */
export const READING_REPLY = JSON.stringify({
  sentences: [
    {
      text: '小明和媽媽一起去公園散步。',
      pinyin: 'Xiǎomíng hé māma yìqǐ qù gōngyuán sànbù.',
      meaning: 'Xiaoming goes for a walk in the park with Mom.',
      words: [
        { hanzi: '小明', pinyin: 'Xiǎomíng', meaning: 'Xiaoming (a name)', role: 'name', confidence: 0.95 },
        { hanzi: '和', pinyin: 'hé', meaning: 'and, with', role: 'word', confidence: 0.95 },
        { hanzi: '媽媽', pinyin: 'māma', meaning: 'mom', role: 'word', confidence: 0.95 },
        { hanzi: '一起', pinyin: 'yìqǐ', meaning: 'together', role: 'word', confidence: 0.9 },
        { hanzi: '去', pinyin: 'qù', meaning: 'to go', role: 'word', confidence: 0.95 },
        { hanzi: '公園', pinyin: 'gōngyuán', meaning: 'park', role: 'word', confidence: 0.95 },
        { hanzi: '散步', pinyin: 'sànbù', meaning: 'to take a walk', role: 'word', confidence: 0.9 },
      ],
    },
    {
      text: '他看到一隻小狗在草地上跑來跑去。',
      pinyin: 'Tā kàndào yì zhī xiǎogǒu zài cǎodì shàng pǎolái pǎoqù.',
      meaning: 'He sees a puppy running around on the grass.',
      words: [
        { hanzi: '他', pinyin: 'tā', meaning: 'he', role: 'word', confidence: 0.95 },
        { hanzi: '看到', pinyin: 'kàndào', meaning: 'to see', role: 'word', confidence: 0.9 },
        { hanzi: '一', pinyin: 'yī', meaning: 'one', role: 'number', confidence: 0.95 },
        { hanzi: '隻', pinyin: 'zhī', meaning: '(measure word for animals)', role: 'word', confidence: 0.9 },
        { hanzi: '小狗', pinyin: 'xiǎogǒu', meaning: 'puppy', role: 'word', confidence: 0.95 },
        { hanzi: '在', pinyin: 'zài', meaning: 'at, on', role: 'word', confidence: 0.95 },
        { hanzi: '草地', pinyin: 'cǎodì', meaning: 'lawn, grass', role: 'word', confidence: 0.9 },
        { hanzi: '上', pinyin: 'shàng', meaning: 'on', role: 'word', confidence: 0.9 },
        { hanzi: '跑來跑去', pinyin: 'pǎoláipǎoqù', meaning: 'to run around', role: 'word', confidence: 0.85 },
      ],
    },
    {
      text: '小狗很可愛，小明笑了。',
      pinyin: 'Xiǎogǒu hěn kě’ài, Xiǎomíng xiào le.',
      meaning: 'The puppy is very cute, and Xiaoming smiles.',
      words: [
        { hanzi: '小狗', pinyin: 'xiǎogǒu', meaning: 'puppy', role: 'word', confidence: 0.95 },
        { hanzi: '很', pinyin: 'hěn', meaning: 'very', role: 'word', confidence: 0.95 },
        { hanzi: '可愛', pinyin: 'kě’ài', meaning: 'cute', role: 'word', confidence: 0.95 },
        { hanzi: '小明', pinyin: 'Xiǎomíng', meaning: 'Xiaoming (a name)', role: 'name', confidence: 0.95 },
        { hanzi: '笑', pinyin: 'xiào', meaning: 'to smile, to laugh', role: 'word', confidence: 0.95 },
        { hanzi: '了', pinyin: 'le', meaning: '(completed action)', role: 'function', confidence: 0.9 },
      ],
    },
  ],
})
