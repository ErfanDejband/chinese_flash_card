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
      detects: [{ backend: 'webgpu', dtype: 'fp16', ms: 420, candidates: 300, shown: 12, threshold: 0.35 }],
      selection: { detector: 4, tapped: 1, drawn: 1 },
      naming: { service: 'OpenRouter (free)', model: 'openrouter/free', ms: 14_100, inputTokens: 512, outputTokens: 160, mosaic: { width: 672, height: 448 }, names: ['1 杯子 bēizi cup (0.9)'] },
      findAll: { service: 'OpenRouter (free)', model: 'openrouter/free', ms: 61_000, error: 'Rate limit' , image: { width: 1536, height: 1152 }, found: [] },
    })
    expect(text).toContain('WebGPU: yes (qualcomm adreno-7xx), fp16')
    expect(text).toContain('Model load: fp16 on webgpu · 8.2 s · downloaded 21.3 MB')
    expect(text).toContain('Model load: q8 on wasm · 0.9 s · from the browser cache')
    expect(text).toContain('Detect: 420 ms on webgpu (fp16) · 12 shown at ≥ 0.35 · 300 candidates')
    expect(text).toContain('Chosen: 6 (4 from boxes, 1 by tapping, 1 drawn)')
    expect(text).toContain('Name with AI (mosaic 672×448): OpenRouter (free) · openrouter/free: 14.1 s · 512 in / 160 out tokens')
    expect(text).toContain('  1 杯子 bēizi cup (0.9)')
    expect(text).toContain('AI only (photo 1536×1152): OpenRouter (free) · openrouter/free: failed after 61.0 s (Rate limit)')
  })
})
