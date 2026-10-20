import { describe, expect, it } from 'vitest'
import { REVIEW_MODES } from '@/domain/leitner/config'
import { REVIEW_MODE_INFO, reviewModeInfo } from './reviewModes'

describe('reviewModeInfo', () => {
  it('describes every direction, listening included', () => {
    for (const mode of REVIEW_MODES) expect(reviewModeInfo(mode)).toBe(REVIEW_MODE_INFO[mode])
    expect(reviewModeInfo('listening')).toMatchObject({ label: 'Sound → Chinese', front: 'The word, spoken' })
  })

  it('falls back to the default direction for one this build does not know', () => {
    expect(reviewModeInfo('bogus')).toBe(REVIEW_MODE_INFO.image_to_word)
    expect(reviewModeInfo('toString')).toBe(REVIEW_MODE_INFO.image_to_word)
  })
})
