import { describe, expect, it, vi } from 'vitest'
import { sampleReply, SAMPLE_ITEMS } from '../demo/samplePage'
import { benchmarkCandidates, fetchListedModels, freeVisionModels, scoreSampleReply, type ListedModel } from './benchmark'
import { ModelOutputError } from './parse'

const vision = { input_modalities: ['text', 'image'], output_modalities: ['text'] }

/** Shaped like OpenRouter's list on 2026-10-23. */
const MODELS: ListedModel[] = [
  { id: 'google/gemma-4-31b-it:free', architecture: vision, reasoning: { mandatory: false, default_enabled: false } },
  { id: 'thinkingmachines/inkling:free', architecture: vision, reasoning: { default_enabled: true, supported_efforts: ['high', 'low', 'none'] } },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', architecture: vision, reasoning: { default_enabled: true } },
  { id: 'nvidia/nemotron-3.5-content-safety:free', architecture: vision },
  { id: 'google/lyria-3-pro-preview', architecture: { input_modalities: ['text', 'image'], output_modalities: ['audio'] } },
  { id: 'some/text-only:free', architecture: { input_modalities: ['text'], output_modalities: ['text'] } },
  { id: 'some/paid-vision', architecture: vision },
  { id: 'openrouter/free', architecture: vision },
  { id: 'some/mandatory-thinker:free', architecture: vision, reasoning: { mandatory: true, default_enabled: true } },
  { id: 'nvidia/nemotron-3.5-super-vl:free', architecture: vision, reasoning: { mandatory: false } },
  { id: 'some/no-reasoning:free', architecture: vision },
]

describe('free model test', () => {
  it('picks free models that read images and write text, leaving out classifiers and music', () => {
    expect(freeVisionModels(MODELS).map((m) => m.id)).toEqual([
      'google/gemma-4-31b-it:free',
      'thinkingmachines/inkling:free',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      'some/mandatory-thinker:free',
      'nvidia/nemotron-3.5-super-vl:free',
      'some/no-reasoning:free',
    ])
  })

  it('tries every model once, then reasoning off where it may be on, and the router twice', () => {
    expect(benchmarkCandidates(MODELS).map((c) => [c.label, c.model, c.extraBody])).toEqual([
      ['google/gemma-4-31b-it:free', 'google/gemma-4-31b-it:free', undefined],
      ['thinkingmachines/inkling:free', 'thinkingmachines/inkling:free', undefined],
      ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', undefined],
      ['some/mandatory-thinker:free', 'some/mandatory-thinker:free', undefined],
      ['nvidia/nemotron-3.5-super-vl:free', 'nvidia/nemotron-3.5-super-vl:free', undefined],
      ['some/no-reasoning:free', 'some/no-reasoning:free', undefined],
      ['thinkingmachines/inkling:free · reasoning off', 'thinkingmachines/inkling:free', { reasoning: { effort: 'none' } }],
      ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free · reasoning off', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', { reasoning: { enabled: false } }],
      ['nvidia/nemotron-3.5-super-vl:free · reasoning off', 'nvidia/nemotron-3.5-super-vl:free', { reasoning: { enabled: false } }],
      ['openrouter/free · try 1', 'openrouter/free', undefined],
      ['openrouter/free · try 2', 'openrouter/free', undefined],
    ])
  })

  it('stays within the request cap, keeping the router tries', () => {
    const labels = benchmarkCandidates(MODELS, 4).map((c) => c.label)
    expect(labels).toEqual(['google/gemma-4-31b-it:free', 'thinkingmachines/inkling:free', 'openrouter/free · try 1', 'openrouter/free · try 2'])
  })

  it('scores a reply against the sample words', () => {
    // The demo's canned reply spells 電腦 in Simplified: that word counts as missed.
    expect(scoreSampleReply(sampleReply())).toEqual({ found: 5, pinyinRight: 5, total: 6, other: 1 })
    const perfect = JSON.stringify({ items: SAMPLE_ITEMS.map((s) => ({ hanzi: s.hanzi, pinyin: s.pinyin, meaning: s.meaning })) })
    expect(scoreSampleReply(perfect)).toEqual({ found: 6, pinyinRight: 6, total: 6, other: 0 })
    // Spaces between syllables don't matter; missing tone marks do.
    const spaced = JSON.stringify({ items: [{ hanzi: '書包', pinyin: 'shū bāo', meaning: '' }, { hanzi: '手機', pinyin: 'shou ji', meaning: '' }] })
    expect(scoreSampleReply(spaced)).toEqual({ found: 2, pinyinRight: 1, total: 6, other: 0 })
  })

  it('fails on a reply that is not the expected JSON', () => {
    expect(() => scoreSampleReply('I see a schoolbag.')).toThrow(ModelOutputError)
  })

  it('reads the public model list without a key', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'a:free' }, { name: 'no id' }] }), { status: 200 }))
    expect(await fetchListedModels(fetchImpl)).toEqual([{ id: 'a:free' }])
    expect(fetchImpl).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models', { signal: undefined })
  })
})
