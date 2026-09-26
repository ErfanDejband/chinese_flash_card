import { describe, expect, it } from 'vitest'
import { loadSimplifiedDetector, loadToTraditional } from './traditional'

describe('Simplified detection', () => {
  it.each(['老师', '学生', '你们', '为什么', '电视', '头发', '台湾', '老師们'])('flags %s', async (text) => {
    expect((await loadSimplifiedDetector())(text)).toBe(true)
  })

  it.each(['台灣', '老師', '學生', '皇后', '公里', '游泳', '干擾', '茶几', '裡面', '我', '鴨子', '為什麼'])('accepts Traditional %s', async (text) => {
    expect((await loadSimplifiedDetector())(text)).toBe(false)
  })

  it('converts phrases to Taiwan Traditional', async () => {
    const convert = await loadToTraditional()
    expect(convert('老师')).toBe('老師')
    expect(convert('头发')).toBe('頭髮')
  })
})
