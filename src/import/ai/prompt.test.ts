import { describe, expect, it } from 'vitest'
import { checkPinyin } from '@/domain/pinyin/suggest'
import { OBJECT_FIND_TASK, OBJECT_NAME_TASK } from '@/vision/tasks'
import { READING_TASK, TAIWAN_READING, VOCAB_TASK } from './prompt'

describe('Taiwan readings', () => {
  it.each([VOCAB_TASK, READING_TASK, OBJECT_NAME_TASK, OBJECT_FIND_TASK].map((t) => [t.id, t]))('%s asks for them', (_, task) => {
    expect(task.system).toContain(TAIWAN_READING)
  })

  it('still puts a printed reading first', () => {
    expect(VOCAB_TASK.system).toContain(`If no pinyin is printed, give ${TAIWAN_READING}`)
    expect(READING_TASK.system).toContain(`follow printed zhuyin if there is any, otherwise give ${TAIWAN_READING}`)
  })

  it('only gives examples the reading check accepts', () => {
    const examples = [...TAIWAN_READING.matchAll(/(\p{Script=Han}+) (\p{L}+)/gu)].map((m) => [m[1]!, m[2]!])
    expect(examples).toHaveLength(5)
    expect(examples.filter(([hanzi, pinyin]) => checkPinyin(hanzi!, pinyin!) !== 'match')).toEqual([])
  })
})
