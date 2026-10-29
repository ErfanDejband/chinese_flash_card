import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { NormBox } from '@/import/types'
import { useBlobUrl } from '@/hooks/useBrowser'
import { Button } from './Button'

type Drag =
  | { mode: 'move'; startX: number; startY: number; box: NormBox }
  | { mode: 'resize'; corner: 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; box: NormBox }
  | { mode: 'draw'; originX: number; originY: number }

const MIN = 20 // smallest box side, in 0–1000 units
const clamp = (v: number) => Math.min(1000, Math.max(0, v))

interface Props {
  image: Blob
  /** Changes when the image changes (for the object URL). */
  imageKey: string
  /** `width / height` of the image. */
  aspectRatio?: string
  imageLabel: string
  title: ReactNode
  subtitle?: ReactNode
  initialBox: NormBox | null
  otherBoxes?: NormBox[]
  /** Return an error message to keep the editor open. */
  onSave(box: NormBox): Promise<string | undefined>
  onRemove?(): Promise<void>
  removeLabel?: string
  onClose(): void
}

/** An image with a draggable, resizable rectangle (touch and mouse via pointer events). */
export function BoxEditor({ image, imageKey, aspectRatio, imageLabel, title, subtitle, initialBox, otherBoxes = [], onSave, onRemove, removeLabel, onClose }: Props) {
  const url = useBlobUrl(image, imageKey)
  const area = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [box, setBox] = useState<NormBox>(initialBox ?? [300, 300, 700, 700])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  /** Pointer position in 0–1000 image units. */
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
    setSaving(true)
    setError(undefined)
    const problem = await onSave(box.map(Math.round) as NormBox)
    if (problem) {
      setSaving(false)
      setError(problem)
      return
    }
    onClose()
  }

  async function remove() {
    setSaving(true)
    await onRemove?.()
    onClose()
  }

  const pct = (b: NormBox) => ({ top: `${b[0] / 10}%`, left: `${b[1] / 10}%`, height: `${(b[2] - b[0]) / 10}%`, width: `${(b[3] - b[1]) / 10}%` })
  const corners = ['nw', 'ne', 'sw', 'se'] as const

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]" role="dialog" aria-modal="true" aria-label="Adjust picture">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 overflow-auto">
        <div className="flex items-center justify-between text-white">
          <div>{title}</div>
          {subtitle && <span className="text-sm text-white/60">{subtitle}</span>}
        </div>
        <p className="text-sm text-white/70">Drag the box or its corners, or drag on the image to draw a new one.</p>

        <div
          ref={area}
          className="relative w-full touch-none overflow-hidden rounded-lg bg-white select-none"
          style={{ aspectRatio: aspectRatio ?? '16 / 9' }}
          onPointerDown={(e) => {
            const p = point(e)
            begin(e, { mode: 'draw', originX: p.x, originY: p.y })
            setBox([p.y, p.x, clamp(p.y + MIN), clamp(p.x + MIN)])
          }}
          onPointerMove={onMove}
          onPointerUp={end}
          onPointerCancel={end}
        >
          {url && <img src={url} alt={imageLabel} className="pointer-events-none absolute inset-0 size-full" draggable={false} />}
          {otherBoxes.map((b, i) => (
            <div key={i} className="pointer-events-none absolute border-2 border-dashed border-sky-500/70" style={pct(b)} />
          ))}
          <div
            className="absolute cursor-move border-[3px] border-accent bg-accent/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            style={pct(box)}
            onPointerDown={(e) => begin(e, { mode: 'move', startX: point(e).x, startY: point(e).y, box })}
          >
            {corners.map((c) => (
              // A small visible handle (it shouldn't hide small objects) inside a larger touch target.
              <span
                key={c}
                onPointerDown={(e) => begin(e, { mode: 'resize', corner: c, startX: point(e).x, startY: point(e).y, box })}
                className="absolute grid size-6 place-items-center"
                style={{
                  top: c.includes('n') ? -12 : undefined,
                  bottom: c.includes('s') ? -12 : undefined,
                  left: c.includes('w') ? -12 : undefined,
                  right: c.includes('e') ? -12 : undefined,
                  cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize',
                }}
              >
                <span className="pointer-events-none size-3.5 rounded-full border-2 border-accent bg-white" />
              </span>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="pb-safe flex flex-wrap justify-end gap-2">
          {onRemove && (
            <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => void remove()} disabled={saving}>
              {removeLabel ?? 'No picture'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            Use this area
          </Button>
        </div>
      </div>
    </div>
  )
}
