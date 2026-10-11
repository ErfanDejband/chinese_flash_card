import { updateDraft } from '@/data/repositories/imports'
import type { ImportDraftRecord, ImportPageRecord } from '@/data/db'
import { boxToPageUnits } from '@/import/pdf/boxes'
import { cropFromImage } from '@/import/pdf/crop'
import type { NormBox } from '@/import/types'
import { BoxEditor } from '@/ui/BoxEditor'
import { Hanzi } from '@/ui/Hanzi'

interface Props {
  draft: ImportDraftRecord
  page: ImportPageRecord
  otherBoxes: NormBox[]
  onClose(): void
}

/** The page image with a box for the card's picture. */
export function CropEditor({ draft, page, otherBoxes, onClose }: Props) {
  if (!page.image) return null
  const image = page.image

  async function save(box: NormBox) {
    const crop = await cropFromImage(image, box)
    if (!crop) return 'That area is too small. Drag a larger box.'
    await updateDraft(draft.id, {
      imageBox: box,
      crop,
      sourceBox: page.pointWidth && page.pointHeight ? boxToPageUnits(box, page.pointWidth, page.pointHeight) : undefined,
    })
    return undefined
  }

  return (
    <BoxEditor
      image={image}
      imageKey={page.id}
      aspectRatio={page.width && page.height ? `${page.width} / ${page.height}` : undefined}
      imageLabel={page.label ?? `Page ${page.page}`}
      title={
        <>
          <Hanzi className="text-xl font-semibold">{draft.hanzi || '—'}</Hanzi> <span className="text-white/70">{draft.pinyin}</span>
        </>
      }
      subtitle={page.label ?? `Page ${page.page}`}
      initialBox={draft.imageBox}
      otherBoxes={otherBoxes}
      onSave={save}
      onRemove={() => updateDraft(draft.id, { imageBox: null, crop: undefined, sourceBox: undefined })}
      onClose={onClose}
    />
  )
}
