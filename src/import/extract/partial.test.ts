import { describe, expect, it } from 'vitest'
import { BOOK2_P5_REPLY, BOOK3_P20_REPLY, READING_REPLY } from '../ai/fixtures'
import { parseModelJson } from '../ai/parse'
import { READING_TASK, VOCAB_TASK } from '../ai/prompt'
import { liveReply, partialItems } from './partial'

const itemsOf = (reply: string) => (parseModelJson(reply) as { items: unknown[] }).items

describe('partialItems', () => {
  it('returns every item of a finished reply', () => {
    expect(partialItems(BOOK2_P5_REPLY, VOCAB_TASK)).toEqual(itemsOf(BOOK2_P5_REPLY))
    // Code fences around the JSON.
    expect(partialItems(BOOK3_P20_REPLY, VOCAB_TASK)).toEqual(itemsOf(BOOK3_P20_REPLY))
  })

  it('returns the finished items of a reply still arriving, growing as it arrives', () => {
    const all = itemsOf(BOOK2_P5_REPLY)
    let seen = 0
    for (let end = 0; end <= BOOK2_P5_REPLY.length; end++) {
      const items = partialItems(BOOK2_P5_REPLY.slice(0, end), VOCAB_TASK)
      expect(items).toEqual(all.slice(0, items.length))
      expect(items.length).toBeGreaterThanOrEqual(seen)
      seen = items.length
    }
    expect(seen).toBe(all.length)
    // The first item counts only once its closing brace has arrived.
    const firstEnd = BOOK2_P5_REPLY.indexOf('},{') + 1
    expect(partialItems(BOOK2_P5_REPLY.slice(0, firstEnd - 1), VOCAB_TASK)).toEqual([])
    expect(partialItems(BOOK2_P5_REPLY.slice(0, firstEnd), VOCAB_TASK)).toHaveLength(1)
  })

  it('ignores prose before the JSON, and braces, brackets, quotes and escapes inside strings', () => {
    const tricky = { hanzi: '好', pinyin: 'hǎo', meaning: 'good {really} "fine" \\ ok', notes: '[see p. 3] }{ ]' }
    const reply = `Sure! Here are the items:\n\`\`\`json\n{"items": [${JSON.stringify(tricky)}, {"hanzi":"老師","notes":"a } b`
    expect(partialItems(reply, VOCAB_TASK)).toEqual([tricky])
  })

  it('finds the list after other keys, and stops at its end', () => {
    const reply = '{"note":"the \\"items\\" below","page":{"items":"no"},"items":[{"hanzi":"牙"}],"extra":[{"hanzi":"not an item"}]}'
    expect(partialItems(reply, VOCAB_TASK)).toEqual([{ hanzi: '牙' }])
  })

  it('returns nothing before the list starts, or for something else entirely', () => {
    for (const text of ['', 'Thinking…', '{"ite', '{"items":', '{"items":[', '{"sentences":[{"text":"x"}]}', 'not json {"items":[1,2]}']) {
      expect(partialItems(text, VOCAB_TASK)).toEqual([])
    }
  })

  it('reads the sentences of a reading reply', () => {
    const sentences = (parseModelJson(READING_REPLY) as { sentences: unknown[] }).sentences
    expect(partialItems(READING_REPLY, READING_TASK)).toEqual(sentences)
    // The words list inside a sentence doesn't end the sentence early.
    const inFirstWords = READING_REPLY.indexOf('"role":"word"')
    expect(partialItems(READING_REPLY.slice(0, inFirstWords), READING_TASK)).toEqual([])
  })
})

describe('liveReply', () => {
  it('lists the hanzi, pinyin and meaning of the finished vocabulary items', () => {
    const half = BOOK2_P5_REPLY.slice(0, BOOK2_P5_REPLY.indexOf('家'))
    expect(liveReply(half, VOCAB_TASK)).toEqual({
      count: 2,
      words: [
        { hanzi: '牙', pinyin: 'yá', meaning: 'tooth' },
        { hanzi: '鴨子', pinyin: 'yā zi', meaning: 'duck' },
      ],
    })
  })

  it('lists the new-word candidates of the finished sentences once each, without names, particles and numbers', () => {
    const twoSentences = READING_REPLY.slice(0, READING_REPLY.indexOf('小狗很可愛'))
    const live = liveReply(twoSentences, READING_TASK)
    expect(live.count).toBe(2)
    expect(live.words.map((w) => w.hanzi)).toEqual(['和', '媽媽', '一起', '去', '公園', '散步', '他', '看到', '隻', '小狗', '在', '草地', '上', '跑來跑去'])
    const all = liveReply(READING_REPLY, READING_TASK)
    expect(all.count).toBe(3)
    expect(all.words.map((w) => w.hanzi).filter((h) => h === '小狗')).toHaveLength(1)
    expect(all.words.some((w) => w.hanzi === '小明' || w.hanzi === '了')).toBe(false)
  })
})
