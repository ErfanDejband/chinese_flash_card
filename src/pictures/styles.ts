import type { PictureQuality } from './types'

export type PictureStyleId = 'flat' | 'sticker' | 'textbook' | 'scene' | 'photo'

export interface PictureStyle {
  id: PictureStyleId
  label: string
  description: string
  /** Appended to every sheet prompt. */
  prompt: string
  /** Simple styles look right at low quality, which is much cheaper on OpenAI models. */
  quality: PictureQuality
}

/** Cheapest first. */
export const PICTURE_STYLES: readonly PictureStyle[] = [
  {
    id: 'flat',
    label: 'Flat icon',
    description: 'Bold shapes, a few flat colours. The cheapest.',
    prompt: 'a simple flat vector icon with bold shapes, two to four flat colours, no shading, on a plain white background',
    quality: 'low',
  },
  {
    id: 'sticker',
    label: 'Sticker',
    description: 'Cute and rounded, with a thick outline, like a kids’ book.',
    prompt: 'a cute kawaii sticker with rounded shapes, a thick dark outline and bright cheerful colours, on a plain white background',
    quality: 'low',
  },
  {
    id: 'textbook',
    label: 'Textbook sketch',
    description: 'Ink outlines with soft watercolour, like your course book.',
    prompt:
      "a hand-drawn children's textbook illustration with clean ink outlines and soft watercolour and coloured-pencil shading, warm natural colours, on a plain white background",
    quality: 'medium',
  },
  {
    id: 'scene',
    label: 'Storybook',
    description: 'Soft pastel drawings with a crayon texture, like a kids’ picture book.',
    prompt:
      "a soft children's picture-book illustration with gentle crayon and coloured-pencil texture, pastel colours, rounded cute characters and a small simple scene, on a plain white background",
    quality: 'medium',
  },
  {
    id: 'photo',
    label: 'Photo',
    description: 'A realistic photo on a plain background.',
    prompt: 'a realistic photograph with soft studio lighting, the subject isolated on a plain white background',
    quality: 'medium',
  },
]

export const DEFAULT_STYLE: PictureStyleId = 'flat'

export function pictureStyle(id: PictureStyleId | undefined): PictureStyle {
  return PICTURE_STYLES.find((s) => s.id === id) ?? PICTURE_STYLES[0]!
}
