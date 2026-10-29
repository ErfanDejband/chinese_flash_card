import { describe, expect, it } from 'vitest'
import { reportText } from './report'

describe('reportText', () => {
  it('summarises loads, detections and both AI runs', () => {
    const text = reportText({
      build: '2026-10-29 · abc1234',
      userAgent: 'Android Chrome',
      webgpu: { available: true, adapter: 'qualcomm adreno-7xx', fp16: true },
      loads: [
        { backend: 'webgpu', dtype: 'fp16', ms: 8200, bytes: 21_300_000, cached: false },
        { backend: 'wasm', dtype: 'q8', ms: 900, bytes: 0, cached: true },
      ],
      photo: { width: 1536, height: 1152 },
      detects: [{ backend: 'webgpu', dtype: 'fp16', ms: 420, candidates: 300, suggested: 9, big: 2, best: 0.93 }],
      benchmark: [
        { backend: 'webgpu', dtype: 'fp32', load: { backend: 'webgpu', dtype: 'fp32', ms: 1300, bytes: 0, cached: true }, times: [1435, 282, 274], suggested: 9, best: 0.93 },
        { backend: 'webgpu', dtype: 'q8', times: [], suggested: 0, best: 0, error: 'unsupported' },
      ],
      selection: { detector: 3, big: 1, tapped: 1, empty: 1, drawn: 1, adjusted: 2 },
      naming: { service: 'OpenRouter (free)', model: 'openrouter/free', ms: 14_100, inputTokens: 512, outputTokens: 160, mosaic: { width: 672, height: 448 }, names: ['1 杯子 bēizi cup (0.9)'] },
      findAll: { service: 'OpenRouter (free)', model: 'openrouter/free', ms: 61_000, error: 'Rate limit' , image: { width: 1536, height: 1152 }, found: [] },
    })
    expect(text).toContain('WebGPU: yes (qualcomm adreno-7xx), fp16')
    expect(text).toContain('Model load: fp16 on webgpu · 8.2 s · downloaded 21.3 MB')
    expect(text).toContain('Model load: q8 on wasm · 0.9 s · from the browser cache')
    expect(text).toContain('Detect: 420 ms on webgpu (fp16) · 9 suggested + 2 big · best 0.93 · 300 candidates')
    expect(text).toContain('  webgpu fp32: load 1.3 s (cache) · detect 1435 / 282 / 274 ms · 9 suggested · best 0.93')
    expect(text).toContain('  webgpu q8: failed (unsupported)')
    expect(text).toContain('Chosen: 7 (3 suggested, 1 big, 1 tapped weaker guesses, 1 tapped empty spots, 1 drawn; 2 adjusted)')
    expect(text).toContain('Name with AI (mosaic 672×448): OpenRouter (free) · openrouter/free: 14.1 s · 512 in / 160 out tokens')
    expect(text).toContain('  1 杯子 bēizi cup (0.9)')
    expect(text).toContain('AI only (photo 1536×1152): OpenRouter (free) · openrouter/free: failed after 61.0 s (Rate limit)')
  })
})
