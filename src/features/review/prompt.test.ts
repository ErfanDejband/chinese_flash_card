import { describe, expect, it } from 'vitest'
import { GRAMMAR_TAG, withGrammar } from '@/domain/grammar'
import { makeCard } from '@/domain/testing'
import { promptKind } from './prompt'

describe('promptKind', () => {
  const word = makeCard({ hanzi: '餐廳', meaning: 'restaurant', imageId: 'pic' })
  const grammar = makeCard({ hanzi: '雖然…但是…', meaning: 'although…, (still)…', imageId: 'pic', tags: [GRAMMAR_TAG] })

  it('asks a word by its picture when the picture is here', () => {
    expect(promptKind(word, 'image_to_word', true)).toBe('image')
    expect(promptKind(word, 'image_to_word', false)).toBe('meaning')
  })

  it('never asks a grammar card by picture', () => {
    expect(promptKind(grammar, 'image_to_word', true)).toBe('meaning')
    expect(promptKind(grammar, 'hanzi_to_meaning', true)).toBe('hanzi')
    expect(promptKind(grammar, 'listening', true)).toBe('sound')
  })
})

describe('withGrammar', () => {
  it('switches the tag on once and off again', () => {
    expect(withGrammar(['hsk1'], true)).toEqual(['hsk1', 'grammar'])
    expect(withGrammar(['grammar', 'hsk1'], true)).toEqual(['hsk1', 'grammar'])
    expect(withGrammar(['grammar', 'hsk1'], false)).toEqual(['hsk1'])
  })
})
