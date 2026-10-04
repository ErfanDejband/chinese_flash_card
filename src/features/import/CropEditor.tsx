import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { updateDraft } from '@/data/repositories/imports'
import type { ImportDraftRecord, ImportPageRecord } from '@/data/db'
import { boxToPageUnits } from '@/import/pdf/boxes'
import { cropFromImage } from '@/import/pdf/crop'
import type { NormBox } from '@/import/types'
import { useBlobUrl } from '@/hooks/useBrowser'
import { Button } from '@/ui/Button'
import { Hanzi } from '@/ui/Hanzi'

type Drag =
  | { mode: 'move'; startX: number; startY: number; box: NormBox }
  | { mode: 'resize'; corner: 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; box: NormBox }
  | { mode: 'draw'; originX: number; originY: number }

const MIN = 20 // smallest box side, in 0–1000 units
const clamp = (v: number) => Math.min(1000, Math.max(0, v))

interface Props {
  draft: ImportDraftRecord
  page: ImportPageRecord
  otherBoxes: NormBox[]
  onClose(): void
}

/** Page image with a draggable, resizable rectangle for the card's picture. Touch and mouse via pointer events. */
export function CropEditor({ draft, page, otherBoxes, onClose }: Props) {
  const url = useBlobUrl(page.image, page.id)
  const area = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [box, setBox] = useState<NormBox>(draft.imageBox ?? [300, 300, 700, 700])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  /** Pointer position in 0–1000 page units. */
  function point(e: ReactPointerEvent) {
    const r = area.current!.getBoundingClientRect()
    return { x: clamp(((e.clientX - r.left) / r.width) * 1000), y: clamp(((e.clientY - r.top) / r.height) * 1000) }
  }

  function begin(e: ReactPointerEvent, next: Drag) {
    e.preventDefault()
    e.stopPropagation()
    drag.current = next
    try {
      area.current?.setPointerCapture(e.pointerId)
    } catch {
      // Capture is a nicety (drags keep working outside the area); some browsers refuse it.
    }
  }

  function onMove(e: ReactPointerEvent) {
    const d = drag.current
    if (!d) return
    const p = point(e)
    if (d.mode === 'draw') {
      setBox([Math.min(d.originY, p.y), Math.min(d.originX, p.x), Math.max(d.originY, p.y), Math.max(d.originX, p.x)])
      return
    }
    const dx = p.x - d.startX
    const dy = p.y - d.startY
    const [y0, x0, y1, x1] = d.box
    if (d.mode === 'move') {
      const mx = Math.min(Math.max(dx, -x0), 1000 - x1)
      const my = Math.min(Math.max(dy, -y0), 1000 - y1)
      setBox([y0 + my, x0 + mx, y1 + my, x1 + mx])
      return
    }
    let [ny0, nx0, ny1, nx1] = d.box
    if (d.corner.includes('n')) ny0 = clamp(Math.min(y0 + dy, y1 - MIN))
    if (d.corner.includes('s')) ny1 = clamp(Math.max(y1 + dy, y0 + MIN))
    if (d.corner.includes('w')) nx0 = clamp(Math.min(x0 + dx, x1 - MIN))
    if (d.corner.includes('e')) nx1 = clamp(Math.max(x1 + dx, x0 + MIN))
    setBox([ny0, nx0, ny1, nx1])
  }

  function end() {
    drag.current = null
  }

  async function save() {
    if (!page.image) return
    setSaving(true)
    setError(undefined)
    const rounded = box.map(Math.round) as NormBox
    const crop = await cropFromImage(page.image, rounded)
    if (!crop) {
      setSaving(false)
      setError('That area is too small. Drag a larger box.')
      return
    }
    await updateDraft(draft.id, {
      imageBox: rounded,
      crop,
      sourceBox: page.pointWidth && page.pointHeight ? boxToPageUnits(rounded, page.pointWidth, page.pointHeight) : undefined,
    })
    onClose()
  }

  async function removePicture() {
    await updateDraft(draft.id, { imageBox: null, crop: undefined, sourceBox: undefined })
    onClose()
  }

  const pct = (b: NormBox) => ({ top: `${b[0] / 10}%`, left: `${b[1] / 10}%`, height: `${(b[2] - b[0]) / 10}%`, width: `${(b[3] - b[1]) / 10}%` })
  const corners = ['nw', 'ne', 'sw', 'se'] as const

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]" role="dialog" aria-modal="true" aria-label="Adjust picture">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 overflow-auto">
        <div className="flex items-center justify-between text-white">
          <div>
            <Hanzi className="text-xl font-semibold">{draft.hanzi || '—'}</Hanzi>{' '}
            <span className="text-white/70">{draft.pinyin}</span>
          </div>
          <span className="text-sm text-white/60">{page.label ?? `Page ${page.page}`}</span>
        </div>
        <p className="text-sm text-white/70">Drag the box or its corners, or drag on the page to draw a new one.</p>

        <div
          ref={area}
          className="relative w-full touch-none overflow-hidden rounded-lg bg-white select-none"
          style={{ aspectRatio: page.width && page.height ? `${page.width} / ${page.height}` : '16 / 9' }}
          onPointerDown={(e) => {
            const p = point(e)
            begin(e, { mode: 'draw', originX: p.x, originY: p.y })
            setBox([p.y, p.x, clamp(p.y + MIN), clamp(p.x + MIN)])
          }}
          onPointerMove={onMove}
          onPointerUp={end}
          onPointerCancel={end}
        >
          {url && <img src={url} alt={page.label ?? `Page ${page.page}`} className="pointer-events-none absolute inset-0 size-full" draggable={false} />}
          {otherBoxes.map((b, i) => (
            <div key={i} className="pointer-events-none absolute border-2 border-dashed border-sky-500/70" style={pct(b)} />
          ))}
          <div
            className="absolute cursor-move border-[3px] border-accent bg-accent/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            style={pct(box)}
            onPointerDown={(e) => begin(e, { mode: 'move', startX: point(e).x, startY: point(e).y, box })}
          >
            {corners.map((c) => (
              <span
                key={c}
                onPointerDown={(e) => begin(e, { mode: 'resize', corner: c, startX: point(e).x, startY: point(e).y, box })}
                className="absolute size-7 rounded-full border-[3px] border-accent bg-white"
                style={{
                  top: c.includes('n') ? -14 : undefined,
                  bottom: c.includes('s') ? -14 : undefined,
                  left: c.includes('w') ? -14 : undefined,
                  right: c.includes('e') ? -14 : undefined,
                  cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize',
                }}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="pb-safe flex flex-wrap justify-end gap-2">
          <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => void removePicture()} disabled={saving}>
            No picture
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !page.image}>
            Use this area
          </Button>
        </div>
      </div>
    </div>
  )
}
