import { useState, type MouseEvent, type ReactNode } from 'react'
import type { NormBox } from '@/import/types'
import { BoxEditor } from '@/ui/BoxEditor'
import { Button } from '@/ui/Button'
import { area, defaultBoxAt, iou, pickAt, suggestObjects, visibleDetections, type Detection } from '@/vision/detections'
import { MOSAIC_MAX } from '@/vision/mosaic'
import { CropThumb } from './CropThumb'
import { BIG_AREA, SOURCE_TEXT, type Chosen, type Photo } from './photo'

const boxStyle = (b: NormBox) => ({ top: `${b[0] / 10}%`, left: `${b[1] / 10}%`, height: `${(b[2] - b[0]) / 10}%`, width: `${(b[3] - b[1]) / 10}%` })
const contains = (b: NormBox, x: number, y: number) => y >= b[0] && y <= b[2] && x >= b[1] && x <= b[3]

interface Props {
  photo: Photo
  /** Every candidate of the detector, best first. */
  detections: readonly Detection[]
  detecting?: boolean
  chosen: Chosen[]
  onChange(next: Chosen[]): void
  view: 'dots' | 'boxes'
  onView(view: 'dots' | 'boxes'): void
  maxSuggest: number
  onMaxSuggest(n: number): void
  /** The lab: a score threshold instead of the suggestions, and the detector's labels. */
  threshold?: number
  showLabels?: boolean
  /** Extra layers over the photo (the lab's "AI only" boxes). */
  overlay?: ReactNode
}

/**
 * The photo with the detector's suggestions (dots or boxes) to tap, big things as chips, and the
 * list of chosen objects with Adjust and Remove. A tap picks the smallest thing under the finger:
 * a chosen box (dropping it), a suggestion, a weaker guess, or else a small box around the spot.
 */
export function ObjectPicker({ photo, detections, detecting, chosen, onChange, view, onView, maxSuggest, onMaxSuggest, threshold, showLabels, overlay }: Props) {
  const [note, setNote] = useState<string>()
  // The box being edited: an index into `chosen`, or 'new' for a drawn one.
  const [editing, setEditing] = useState<number | 'new'>()
  const suggestions = suggestObjects(detections, { bigArea: BIG_AREA, max: maxSuggest })
  const shown = threshold === undefined ? suggestions.small : visibleDetections(detections, threshold).filter((d) => area(d.box) <= BIG_AREA)
  const isChosen = (b: NormBox) => chosen.some((c) => iou(c.box, b) > 0.8)

  function add(items: Chosen[]) {
    const room = MOSAIC_MAX - chosen.length
    if (room <= 0) return setNote(`Up to ${MOSAIC_MAX} objects at a time.`)
    onChange([...chosen, ...items.slice(0, room)])
  }

  function onTap(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 1000
    const y = ((e.clientY - rect.top) / rect.height) * 1000
    setNote(undefined)
    // Dots are small targets: a tap near one (within ~36 px) chooses it.
    if (view === 'dots') {
      const near = shown
        .filter((d) => !isChosen(d.box))
        .map((d) => ({ d, px: Math.hypot((((d.box[1] + d.box[3]) / 2 - x) / 1000) * rect.width, (((d.box[0] + d.box[2]) / 2 - y) / 1000) * rect.height) }))
        .filter((o) => o.px <= 36)
        .sort((a, b) => a.px - b.px)[0]
      if (near) return add([{ box: near.d.box, label: near.d.label, source: 'detector' }])
    }
    // Whatever is smallest under the finger wins, so a tap on a remote inside a chosen cat adds the remote.
    const weak = pickAt(detections, x, y, undefined, BIG_AREA)
    const options: { box: NormBox; drop?: Chosen; add?: Chosen }[] = [
      ...chosen.filter((c) => contains(c.box, x, y)).map((c) => ({ box: c.box, drop: c })),
      ...shown.filter((d) => contains(d.box, x, y) && !isChosen(d.box)).map((d) => ({ box: d.box, add: { box: d.box, label: d.label, source: 'detector' as const } })),
      ...(weak && !isChosen(weak.box) && !shown.includes(weak) ? [{ box: weak.box, add: { box: weak.box, label: weak.label, source: 'tapped' as const } }] : []),
    ]
    const target = options.sort((a, b) => area(a.box) - area(b.box))[0]
    if (target?.drop) return onChange(chosen.filter((c) => c !== target.drop))
    // Nothing there: a box around the finger, to adjust if needed.
    add([target?.add ?? { box: defaultBoxAt(x, y, photo.canvas.width / photo.canvas.height), source: 'empty' }])
  }

  return (
    <>
      <div className="relative cursor-crosshair touch-manipulation overflow-hidden rounded-xl" onClick={onTap}>
        <img src={photo.url} alt="Your photo" className="block w-full select-none" draggable={false} />
        {shown
          .filter((d) => !isChosen(d.box))
          .map((d, i) =>
            view === 'dots' ? (
              <div
                key={`d${i}`}
                className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow-[0_0_0_1.5px_rgba(0,0,0,0.5)]"
                style={{ top: `${(d.box[0] + d.box[2]) / 20}%`, left: `${(d.box[1] + d.box[3]) / 20}%` }}
              >
                {showLabels && <span className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 px-1 text-[10px] leading-4 whitespace-nowrap text-white">{d.label}</span>}
              </div>
            ) : (
              <div key={`d${i}`} className="pointer-events-none absolute rounded-md border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]" style={boxStyle(d.box)}>
                {showLabels && <span className="absolute top-0 left-0 bg-black/60 px-1 text-[10px] leading-4 text-white">{d.label}</span>}
              </div>
            ),
          )}
        {overlay}
        {chosen.map((c, i) => (
          <div key={`c${i}`} className="pointer-events-none absolute rounded-md border-[3px] border-accent" style={boxStyle(c.box)}>
            <span className="absolute -top-px -left-px grid size-6 place-items-center rounded-br-md bg-accent text-xs font-bold text-on-accent">{i + 1}</span>
          </div>
        ))}
        {detecting && <div className="absolute inset-0 grid place-items-center bg-black/30 text-sm font-semibold text-white">Finding objects…</div>}
      </div>
      <p className="mt-2 text-sm text-muted">
        Tap {view === 'dots' ? 'a dot or an object' : 'an object'} to choose it, tap again to drop it. Where nothing is suggested, a tap adds a small box you can adjust.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div className="flex overflow-hidden rounded-xl border border-line" role="group" aria-label="How suggestions look">
          {(['dots', 'boxes'] as const).map((v) => (
            <button key={v} type="button" onClick={() => onView(v)} className={`px-3 py-1.5 ${view === v ? 'bg-accent text-on-accent' : 'bg-paper'}`} aria-pressed={view === v}>
              {v === 'dots' ? 'Dots' : 'Boxes'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted">Suggest</span>
          <Button size="sm" variant="ghost" onClick={() => onMaxSuggest(Math.max(1, maxSuggest - 1))} disabled={maxSuggest <= 1} aria-label="Fewer suggestions">
            −
          </Button>
          <span className="w-6 text-center font-semibold">{maxSuggest}</span>
          <Button size="sm" variant="ghost" onClick={() => onMaxSuggest(Math.min(MOSAIC_MAX, maxSuggest + 1))} disabled={maxSuggest >= MOSAIC_MAX} aria-label="More suggestions">
            +
          </Button>
        </div>
      </div>
      {suggestions.big.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Also in the photo:</span>
          {suggestions.big.map((d, i) => {
            const picked = chosen.find((c) => iou(c.box, d.box) > 0.8)
            return (
              <button
                key={i}
                type="button"
                onClick={() => (picked ? onChange(chosen.filter((c) => c !== picked)) : add([{ box: d.box, label: d.label, source: 'big' }]))}
                className={`flex items-center gap-1 rounded-full border py-0.5 pr-2.5 pl-0.5 ${picked ? 'border-accent bg-accent/10' : 'border-line bg-paper'}`}
                aria-pressed={Boolean(picked)}
              >
                <CropThumb photo={photo.canvas} box={d.box} size={28} />
                {picked ? '✓' : '+'}
                {showLabels && <span className="text-xs text-muted">{d.label}</span>}
              </button>
            )
          })}
        </div>
      )}
      {note && <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">{note}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => add(shown.filter((d) => !isChosen(d.box)).map((d) => ({ box: d.box, label: d.label, source: 'detector' as const })))}
          disabled={!shown.some((d) => !isChosen(d.box))}
        >
          Choose all suggested
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing('new')} disabled={chosen.length >= MOSAIC_MAX}>
          Draw a box
        </Button>
        {chosen.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>
            Clear
          </Button>
        )}
      </div>

      {chosen.length > 0 && (
        <ol className="mt-3 space-y-2">
          {chosen.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-xs font-bold text-on-accent">{i + 1}</span>
              <CropThumb photo={photo.canvas} box={c.box} size={40} />
              <span className="min-w-0 flex-1 truncate text-muted">
                {SOURCE_TEXT[c.source]}
                {c.adjusted ? ', adjusted' : ''}
                {showLabels && c.label ? ` · ${c.label}` : ''}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>
                Adjust
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(chosen.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </li>
          ))}
        </ol>
      )}

      {editing !== undefined && (
        <BoxEditor
          image={photo.blob}
          imageKey={photo.key}
          aspectRatio={`${photo.canvas.width} / ${photo.canvas.height}`}
          imageLabel="Your photo"
          title={editing === 'new' ? 'Draw a box around the object' : `Adjust object ${editing + 1}`}
          initialBox={editing === 'new' ? null : chosen[editing]!.box}
          otherBoxes={chosen.filter((_, j) => j !== editing).map((c) => c.box)}
          onSave={async (box) => {
            if (editing === 'new') add([{ box, source: 'drawn' }])
            else onChange(chosen.map((c, j) => (j === editing ? { ...c, box, adjusted: true } : c)))
            setEditing(undefined)
            return undefined
          }}
          onRemove={
            editing === 'new'
              ? undefined
              : async () => {
                  onChange(chosen.filter((_, j) => j !== editing))
                  setEditing(undefined)
                }
          }
          removeLabel="Remove this object"
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  )
}
