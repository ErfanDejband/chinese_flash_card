import { DEFAULT_REVIEW_MODE, isReviewMode } from '@/domain/leitner/config'
import type { ReviewMode } from '@/domain/types'

export interface ReviewModeInfo {
  label: string
  front: string
  back: string
}

/** How each practice direction is described in the UI. */
export const REVIEW_MODE_INFO: Record<ReviewMode, ReviewModeInfo> = {
  image_to_word: {
    label: 'Picture → Chinese',
    front: 'Picture (or the meaning if a card has no picture)',
    back: 'Characters, pinyin and meaning',
  },
  hanzi_to_meaning: {
    label: 'Chinese → meaning',
    front: 'Characters',
    back: 'Pinyin, meaning and picture',
  },
  listening: {
    label: 'Sound → Chinese',
    front: 'The word, spoken',
    back: 'Characters, pinyin, meaning and picture',
  },
}

/** The description of `mode`; a direction this build doesn't know falls back to the default one. */
export function reviewModeInfo(mode: string): ReviewModeInfo {
  return REVIEW_MODE_INFO[isReviewMode(mode) ? mode : DEFAULT_REVIEW_MODE]
}
