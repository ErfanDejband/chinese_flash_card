import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DETECTOR_REVISION } from './detector'

describe('the hosted object detector', () => {
  it('is fetched at the same revision the lab loads from Hugging Face', () => {
    const script = readFileSync(new URL('../../scripts/fetch-vision.mjs', import.meta.url), 'utf8')
    expect(script).toContain(`const REVISION = '${DETECTOR_REVISION}'`)
  })
})
