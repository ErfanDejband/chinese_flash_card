import type { ReviewMode } from '@/domain/types'

/** How each practice direction is described in the UI. */
export const REVIEW_MODE_INFO: Record<ReviewMode, { label: string; front: string; back: string }> = {
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
}
