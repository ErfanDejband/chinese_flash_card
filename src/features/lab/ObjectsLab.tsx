import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link } from 'react-router'
import { configProblems, createProvider, serviceLabel } from '@/import/ai/createProvider'
import { bytesToBase64 } from '@/import/ai/http'
import { parseModelJson } from '@/import/ai/parse'
import type { JsonTask } from '@/import/ai/prompt'
import type { PageResponse } from '@/import/ai/types'
import { canvasToBlob, downscale } from '@/import/render'
import type { NormBox } from '@/import/types'
import { activeProviderConfig, getAiSettings } from '@/lib/aiConfig'
import { recordUsage } from '@/lib/aiUsage'
import { versionLabel } from '@/lib/appBuild'
import { BoxEditor } from '@/ui/BoxEditor'
import { Button } from '@/ui/Button'
import { PageHeader } from '@/ui/PageHeader'
import { area, defaultBoxAt, iou, pickAt, suggestObjects, visibleDetections, type Detection } from '@/vision/detections'
import { loadDetector, webGpuInfo, type Detector, type DetectorBackend, type DetectorDtype, type GpuInfo } from '@/vision/detector'
import { drawMosaic, MOSAIC_MAX, mosaicLayout } from '@/vision/mosaic'
import { reportText, type AiRun, type BenchmarkRow, type LabReport } from '@/vision/report'
import {
  defaultChoice,
  nameInput,
  OBJECT_FIND_TASK,
  OBJECT_NAME_TASK,
  validateFound,
  validateNames,
  type FoundObject,
  type LearnerLevel,
  type ObjectWords,
} from '@/vision/tasks'

/** Long side of the photo the lab works on (the import sends the same size to the AI). */
const PHOTO_SIZE = 1536
/** Boxes covering more of the photo than this are "big things" (desk, TV): chips, not boxes. */
const BIG_AREA = 0.35

interface Photo {
  canvas: HTMLCanvasElement
  blob: Blob
  url: string
  key: string
}

type Source = 'detector' | 'big' | 'tapped' | 'empty' | 'drawn'

interface Chosen {
  box: NormBox
  /** The detector's guess, sent to the AI as a hint. */
  label?: string
  source: Source
  adjusted?: boolean
}

const SOURCE_TEXT: Record<Source, string> = {
  detector: 'suggested',
  big: 'big thing',
  tapped: 'tapped',
  empty: 'tapped spot',
  drawn: 'drawn',
}

const selectClass = 'h-10 rounded-xl border border-line bg-paper px-2 text-sm outline-none focus:border-accent'
const sectionClass = 'mb-4 rounded-3xl border border-line bg-surface p-4'

const boxStyle = (b: NormBox) => ({ top: `${b[0] / 10}%`, left: `${b[1] / 10}%`, height: `${(b[2] - b[0]) / 10}%`, width: `${(b[3] - b[1]) / 10}%` })
const contains = (b: NormBox, x: number, y: number) => y >= b[0] && y <= b[2] && x >= b[1] && x <= b[3]
const backendName = (b: DetectorBackend) => (b === 'webgpu' ? 'WebGPU' : 'WASM (CPU)')
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Test page for the coming camera tab (/lab/objects, not in the menu): detect objects in a photo on
 * the device, choose some, and compare naming them from one mosaic with sending the whole photo.
 * Nothing here creates cards; the copyable report is for planning the real tab.
 */
export function ObjectsLab() {
  const [gpu, setGpu] = useState<GpuInfo>()
  const [backend, setBackend] = useState<'auto' | DetectorBackend>('auto')
  const [dtype, setDtype] = useState<'auto' | DetectorDtype>('auto')
  const [detector, setDetector] = useState<Detector>()
  const [loading, setLoading] = useState<{ loaded: number; total: number }>()
  const [error, setError] = useState<string>()
  const [photo, setPhoto] = useState<Photo>()
  const [all, setAll] = useState<Detection[]>([])
  const [detecting, setDetecting] = useState(false)
  const [threshold, setThreshold] = useState<number>()
  const [showLabels, setShowLabels] = useState(false)
  // How suggestions look: a dot per object (box once chosen), or boxes; and how many to offer.
  const [view, setView] = useState<'dots' | 'boxes'>('dots')
  const [maxSuggest, setMaxSuggest] = useState(6)
  const [chosen, setChosen] = useState<Chosen[]>([])
  // The box being edited: an index into `chosen`, or 'new' for a drawn one.
  const [editing, setEditing] = useState<number | 'new'>()
  const [note, setNote] = useState<string>()
  const [mosaicUrl, setMosaicUrl] = useState<string>()
  const [names, setNames] = useState<Map<number, ObjectWords>>()
  // Which words the learner keeps per picture number (indexes into its words); one by default.
  const [picks, setPicks] = useState<Record<number, number[]>>({})
  const [learner, setLearner] = useState<LearnerLevel>('beginner')
  const [found, setFound] = useState<FoundObject[]>()
  const [showFound, setShowFound] = useState(true)
  const [busy, setBusy] = useState<'name' | 'find'>()
  const [benchmarking, setBenchmarking] = useState<string>()
  const [report, setReport] = useState<LabReport>({ build: versionLabel(), userAgent: navigator.userAgent, webgpu: { available: false }, loads: [], detects: [] })
  const [copied, setCopied] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)

  const config = activeProviderConfig(getAiSettings())
  const aiProblems = configProblems(config)
  const service = serviceLabel(config)
  const suggestions = suggestObjects(all, { bigArea: BIG_AREA, max: maxSuggest })
  const shown = threshold === undefined ? suggestions.small : visibleDetections(all, threshold).filter((d) => area(d.box) <= BIG_AREA)
  const best = all[0]?.score ?? 0

  useEffect(() => {
    void webGpuInfo().then((info) => {
      setGpu(info)
      setReport((r) => ({ ...r, webgpu: info }))
    })
    return () => abort.current?.abort()
  }, [])

  // The model holds GPU/WASM memory: free it when it is replaced or the page closes.
  useEffect(() => () => void detector?.dispose(), [detector])
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo])
  useEffect(() => () => void (mosaicUrl && URL.revokeObjectURL(mosaicUrl)), [mosaicUrl])

  const chosenBackend: DetectorBackend = backend === 'auto' ? (gpu?.available ? 'webgpu' : 'wasm') : backend
  // fp16 gave no detections at all on an Adreno GPU (2026-10-29), so Auto never picks it.
  const autoDtype: DetectorDtype = chosenBackend === 'webgpu' ? 'fp32' : 'q8'
  const chosenDtype: DetectorDtype = dtype === 'auto' ? autoDtype : dtype

  async function detect(d: Detector, p: Photo) {
    setDetecting(true)
    setError(undefined)
    try {
      const result = await d.detect(p.canvas)
      setAll(result.detections)
      const s = suggestObjects(result.detections, { bigArea: BIG_AREA, max: maxSuggest })
      const run = { backend: d.backend, dtype: d.dtype, ms: result.ms, candidates: result.detections.length, suggested: s.small.length, big: s.big.length, best: result.detections[0]?.score ?? 0 }
      setReport((r) => ({ ...r, detects: [...r.detects, run] }))
    } catch (e) {
      setError(`Detection failed: ${message(e)}`)
    } finally {
      setDetecting(false)
    }
  }

  async function load(target: { backend: DetectorBackend; dtype: DetectorDtype } = { backend: chosenBackend, dtype: chosenDtype }) {
    setError(undefined)
    setLoading({ loaded: 0, total: 0 })
    try {
      setDetector(undefined)
      const { detector: d, report: r } = await loadDetector(target.backend, target.dtype, (l, t) => setLoading({ loaded: l, total: t }))
      setDetector(d)
      setReport((rep) => ({ ...rep, loads: [...rep.loads, r] }))
      if (photo) await detect(d, photo)
    } catch (e) {
      setError(`Loading the model failed: ${message(e)}`)
    } finally {
      setLoading(undefined)
    }
  }

  /** Every setup on the current photo: load, then 3 detections (the first includes warm-up). */
  async function benchmark() {
    if (!photo) return
    setError(undefined)
    setDetector(undefined)
    const setups: (readonly [DetectorBackend, DetectorDtype])[] = [
      ...(gpu?.available ? ([['webgpu', 'fp32'], ['webgpu', 'q8']] as const) : []),
      ['wasm', 'q8'],
      ['wasm', 'fp32'],
    ]
    const rows: BenchmarkRow[] = []
    for (const [i, [b, d]] of setups.entries()) {
      setBenchmarking(`${backendName(b)} ${d} (${i + 1} of ${setups.length})…`)
      let tested: Detector | undefined
      try {
        const { detector: det, report: loadReport } = await loadDetector(b, d)
        tested = det
        const times: number[] = []
        let last: Detection[] = []
        for (let k = 0; k < 3; k++) {
          const result = await det.detect(photo.canvas)
          times.push(result.ms)
          last = result.detections
        }
        rows.push({ backend: b, dtype: d, load: loadReport, times, suggested: suggestObjects(last, { bigArea: BIG_AREA, max: maxSuggest }).small.length, best: last[0]?.score ?? 0 })
      } catch (e) {
        rows.push({ backend: b, dtype: d, times: [], suggested: 0, best: 0, error: message(e) })
      } finally {
        await tested?.dispose()
      }
      setReport((r) => ({ ...r, benchmark: [...rows] }))
    }
    setBenchmarking(undefined)
    await load()
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(undefined)
    try {
      const bitmap = await createImageBitmap(file) // applies the EXIF rotation
      const full = document.createElement('canvas')
      full.width = bitmap.width
      full.height = bitmap.height
      full.getContext('2d')!.drawImage(bitmap, 0, 0)
      bitmap.close()
      const canvas = downscale(full, PHOTO_SIZE)
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9)
      const next = { canvas, blob, url: URL.createObjectURL(blob), key: `${file.name}-${file.lastModified}` }
      setPhoto(next)
      setAll([])
      setChosen([])
      setNames(undefined)
      setFound(undefined)
      setMosaicUrl(undefined)
      setReport((r) => ({ ...r, photo: { width: canvas.width, height: canvas.height }, selection: undefined, naming: undefined, findAll: undefined, benchmark: undefined }))
      if (detector) await detect(detector, next)
    } catch {
      setError('This photo could not be read (HEIC photos need a browser that can open them).')
    }
  }

  function choose(next: Chosen[]) {
    setChosen(next)
    setNames(undefined)
    const count = (s: Source) => next.filter((c) => c.source === s).length
    const selection = { detector: count('detector'), big: count('big'), tapped: count('tapped'), empty: count('empty'), drawn: count('drawn'), adjusted: next.filter((c) => c.adjusted).length }
    setReport((r) => ({ ...r, selection }))
  }

  const isChosen = (b: NormBox) => chosen.some((c) => iou(c.box, b) > 0.8)

  function add(items: Chosen[]) {
    const room = MOSAIC_MAX - chosen.length
    if (room <= 0) return setNote(`One mosaic holds up to ${MOSAIC_MAX} objects.`)
    choose([...chosen, ...items.slice(0, room)])
  }

  function onTap(e: MouseEvent<HTMLDivElement>) {
    if (!photo) return
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
    // Whatever is smallest under the finger wins: a chosen box (tap = drop it), a suggested box,
    // or one of the detector's weaker guesses. So a tap on a remote inside a chosen cat adds the remote.
    const weak = pickAt(all, x, y, undefined, BIG_AREA)
    const options: { box: NormBox; drop?: Chosen; add?: Chosen }[] = [
      ...chosen.filter((c) => contains(c.box, x, y)).map((c) => ({ box: c.box, drop: c })),
      ...shown.filter((d) => contains(d.box, x, y) && !isChosen(d.box)).map((d) => ({ box: d.box, add: { box: d.box, label: d.label, source: 'detector' as const } })),
      ...(weak && !isChosen(weak.box) && !shown.includes(weak) ? [{ box: weak.box, add: { box: weak.box, label: weak.label, source: 'tapped' as const } }] : []),
    ]
    const target = options.sort((a, b) => area(a.box) - area(b.box))[0]
    if (target?.drop) return choose(chosen.filter((c) => c !== target.drop))
    // Nothing there: a box around the finger, to adjust if needed.
    add([target?.add ?? { box: defaultBoxAt(x, y, photo.canvas.width / photo.canvas.height), source: 'empty' }])
  }

  async function ask(task: JsonTask, image: Blob, textHint: string): Promise<{ res?: PageResponse; run: AiRun }> {
    abort.current?.abort()
    abort.current = new AbortController()
    const started = performance.now()
    try {
      const res = await createProvider(config).extractPage({
        imageBase64: bytesToBase64(new Uint8Array(await image.arrayBuffer())),
        mime: 'image/jpeg',
        textHint,
        task,
        signal: abort.current.signal,
      })
      recordUsage(config.provider, res.model || config.model, res.usage)
      const run = { service, model: res.model || config.model, ms: Math.round(performance.now() - started), inputTokens: res.usage?.inputTokens, outputTokens: res.usage?.outputTokens, costUsd: res.usage?.costUsd }
      return { res, run }
    } catch (e) {
      return { run: { service, model: config.model, ms: Math.round(performance.now() - started), error: message(e) } }
    }
  }

  async function nameWithAi() {
    if (!photo || !chosen.length) return
    setBusy('name')
    setNames(undefined)
    const mosaic = drawMosaic(photo.canvas, chosen.map((c) => c.box))
    const blob = await canvasToBlob(mosaic, 'image/jpeg', 0.9)
    setMosaicUrl(URL.createObjectURL(blob))
    const { res, run } = await ask(OBJECT_NAME_TASK, blob, nameInput(mosaicLayout(chosen.length), chosen.map((c) => c.label)))
    if (res) {
      try {
        const named = validateNames(parseModelJson(res.text), chosen.length)
        setNames(named)
        setPicks(defaultPicks(named, learner))
      } catch (e) {
        run.error = message(e)
      }
    }
    // The name lines are added when the report is shown, so they follow the learner's picks.
    setReport((r) => ({ ...r, naming: { ...run, mosaic: { width: mosaic.width, height: mosaic.height }, names: [] } }))
    setBusy(undefined)
  }

  function togglePick(index: number, word: number) {
    setPicks((p) => {
      const current = p[index] ?? []
      if (!current.includes(word)) return { ...p, [index]: [...current, word].sort() }
      // Keep at least one word per object.
      return current.length > 1 ? { ...p, [index]: current.filter((w) => w !== word) } : p
    })
  }

  function nameLines(): string[] {
    if (!names) return []
    return chosen.map((c, i) => {
      const n = names.get(i + 1)
      const hint = c.label ? ` [detector: ${c.label}]` : ''
      if (!n?.words.length) return `${i + 1} (no answer)${hint}`
      const words = n.words.map((w, k) => `${w.hanzi} ${w.pinyin} ${w.meaning} (${w.kind} ${w.level ?? '?'}${picks[i + 1]?.includes(k) ? ' ✓' : ''})`).join(' · ')
      return `${i + 1} ${words}${n.category ? ` · tag ${n.category.hanzi} ${n.category.meaning}` : ''} · ${n.confidence}${hint}`
    })
  }

  async function findWithAi() {
    if (!photo) return
    setBusy('find')
    setFound(undefined)
    const { res, run } = await ask(OBJECT_FIND_TASK, photo.blob, '')
    let objects: FoundObject[] = []
    if (res) {
      try {
        objects = validateFound(parseModelJson(res.text))
        setFound(objects)
      } catch (e) {
        run.error = message(e)
      }
    }
    const image = { width: photo.canvas.width, height: photo.canvas.height }
    setReport((r) => ({ ...r, findAll: { ...run, image, found: objects.map((o) => `${o.hanzi} ${o.pinyin}`) } }))
    setBusy(undefined)
  }

  const text = reportText({
    ...report,
    view: { style: view, max: maxSuggest },
    learner,
    naming: report.naming && { ...report.naming, names: nameLines() },
  })
  const loaded = detector && `${detector.dtype} on ${backendName(detector.backend)}`
  const lastRun = report.detects.at(-1)

  return (
    <div>
      <PageHeader title="Objects lab" subtitle="Test page for the camera tab. Nothing here makes cards." back="/" />

      <section className={sectionClass}>
        <h2 className="mb-1 font-semibold">1 · Object detector on this device</h2>
        <p className="mb-3 text-sm text-muted">
          D-FINE-S (365 kinds of everyday things). The first load downloads 11–45 MB from Hugging Face and jsDelivr; later loads come from the browser cache.
          WebGPU: {gpu === undefined ? 'checking…' : gpu.available ? `yes${gpu.adapter ? ` (${gpu.adapter})` : ''}${gpu.fp16 ? ', fp16' : ', no fp16'}` : 'not available'}.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select className={selectClass} value={backend} onChange={(e) => setBackend(e.target.value as typeof backend)} aria-label="Where to run the model">
            <option value="auto">Auto ({gpu?.available ? 'WebGPU' : 'WASM'})</option>
            <option value="webgpu" disabled={gpu !== undefined && !gpu.available}>WebGPU (graphics chip)</option>
            <option value="wasm">WASM (processor)</option>
          </select>
          <select className={selectClass} value={dtype} onChange={(e) => setDtype(e.target.value as typeof dtype)} aria-label="Model precision">
            <option value="auto">Auto ({autoDtype === 'q8' ? 'int8' : autoDtype})</option>
            <option value="q8">int8 · 11 MB</option>
            <option value="fp16" disabled={chosenBackend === 'webgpu' && gpu?.fp16 === false}>
              fp16 · 21 MB (broken on some phones)
            </option>
            <option value="fp32">fp32 · 42 MB</option>
          </select>
          <Button size="sm" onClick={() => void load()} disabled={Boolean(loading) || Boolean(benchmarking)}>
            {loaded ? 'Load again' : 'Load the model'}
          </Button>
        </div>
        {loading && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${loading.total ? (loading.loaded / loading.total) * 100 : 5}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">{loading.total ? `${(loading.loaded / 1e6).toFixed(1)} of ${(loading.total / 1e6).toFixed(1)} MB` : 'Starting…'}</p>
          </div>
        )}
        {loaded && !loading && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">Loaded: {loaded}.</p>}
        {lastRun && lastRun.best < 0.1 && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            This setting found nothing on this device (fp16 does this on some phones). Try fp32 or int8.
          </p>
        )}
      </section>

      <section className={sectionClass}>
        <h2 className="mb-3 font-semibold">2 · A photo of things around you</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => camera.current?.click()}>
            Take a photo
          </Button>
          <Button size="sm" variant="secondary" onClick={() => gallery.current?.click()}>
            Choose a photo
          </Button>
          {photo && (
            <Button size="sm" variant="ghost" onClick={() => detector && void detect(detector, photo)} disabled={!detector || detecting || Boolean(benchmarking)}>
              Detect again
            </Button>
          )}
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0]).finally(() => (e.target.value = ''))} />

        {photo && (
          <>
            <div className="relative mt-3 cursor-crosshair touch-manipulation overflow-hidden rounded-xl" onClick={onTap}>
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
              {showFound &&
                found?.map((f, i) => (
                  <div key={`f${i}`} className="pointer-events-none absolute border-2 border-dashed border-sky-400" style={boxStyle(f.box)}>
                    <span className="absolute right-0 bottom-0 bg-sky-600/80 px-1 text-xs text-white">{f.hanzi}</span>
                  </div>
                ))}
              {chosen.map((c, i) => (
                <div key={`c${i}`} className="pointer-events-none absolute rounded-md border-[3px] border-accent" style={boxStyle(c.box)}>
                  <span className="absolute -top-px -left-px grid size-6 place-items-center rounded-br-md bg-accent text-xs font-bold text-on-accent">{i + 1}</span>
                </div>
              ))}
              {detecting && <div className="absolute inset-0 grid place-items-center bg-black/30 text-sm font-semibold text-white">Detecting…</div>}
            </div>
            <p className="mt-2 text-sm text-muted">
              Tap {view === 'dots' ? 'a dot or an object' : 'an object'} to choose it, tap again to drop it. Where nothing is suggested, a tap adds a small box you can adjust below.
              {all.length > 0 && ` ${shown.length} suggested.`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <div className="flex overflow-hidden rounded-xl border border-line" role="group" aria-label="How suggestions look">
                {(['dots', 'boxes'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setView(v)} className={`px-3 py-1.5 ${view === v ? 'bg-accent text-on-accent' : 'bg-paper'}`} aria-pressed={view === v}>
                    {v === 'dots' ? 'Dots' : 'Boxes'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted">Suggest</span>
                <Button size="sm" variant="ghost" onClick={() => setMaxSuggest((n) => Math.max(1, n - 1))} disabled={maxSuggest <= 1} aria-label="Fewer suggestions">
                  −
                </Button>
                <span className="w-6 text-center font-semibold">{maxSuggest}</span>
                <Button size="sm" variant="ghost" onClick={() => setMaxSuggest((n) => Math.min(MOSAIC_MAX, n + 1))} disabled={maxSuggest >= MOSAIC_MAX} aria-label="More suggestions">
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
                      onClick={() => (picked ? choose(chosen.filter((c) => c !== picked)) : add([{ box: d.box, label: d.label, source: 'big' }]))}
                      className={`flex items-center gap-1 rounded-full border py-0.5 pr-2.5 pl-0.5 ${picked ? 'border-accent bg-accent/10' : 'border-line bg-paper'}`}
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
                <Button size="sm" variant="ghost" onClick={() => choose([])}>
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
                    <Button size="sm" variant="ghost" onClick={() => choose(chosen.filter((_, j) => j !== i))}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ol>
            )}

            <details className="mt-4 rounded-2xl border border-line p-3 text-sm">
              <summary className="cursor-pointer font-medium">Advanced (for testing)</summary>
              <label className="mt-3 flex items-center gap-2">
                <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Show the detector’s guesses (often wrong; the AI names objects itself)
              </label>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={threshold !== undefined} onChange={(e) => setThreshold(e.target.checked ? 0.35 : undefined)} /> Use a score threshold instead of the suggestions
              </label>
              {threshold !== undefined && (
                <label className="mt-2 flex items-center gap-2">
                  Show from {threshold.toFixed(2)}
                  <input type="range" min={0.05} max={0.9} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="flex-1 accent-accent" />
                </label>
              )}
              <p className="mt-2 text-xs text-muted">Best score in this photo: {best.toFixed(2)} · {all.length} candidates.</p>
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => void benchmark()} disabled={Boolean(benchmarking) || Boolean(loading)}>
                {benchmarking ? `Benchmark: ${benchmarking}` : 'Benchmark every setup on this photo'}
              </Button>
              <p className="mt-1 text-xs text-muted">Loads each model setup in turn (up to ~110 MB the first time) and detects 3 times with each.</p>
            </details>
          </>
        )}
      </section>

      {photo && (
        <section className={sectionClass}>
          <h2 className="mb-1 font-semibold">3 · Name them with AI</h2>
          {aiProblems.length ? (
            <p className="text-sm text-muted">
              Set up AI first in <Link to="/settings/ai" className="text-accent underline">Settings → AI &amp; pictures</Link>.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">Uses {service}. The mosaic sends only the chosen objects, as one small picture; “AI only” sends the whole photo and lets the AI find things itself.</p>
              <label className="mb-3 flex items-center gap-2 text-sm">
                My level
                <select
                  className={selectClass}
                  value={learner}
                  onChange={(e) => {
                    const next = e.target.value as LearnerLevel
                    setLearner(next)
                    if (names) setPicks(defaultPicks(names, next))
                  }}
                >
                  <option value="beginner">Beginner · everyday words</option>
                  <option value="intermediate">Intermediate · more precise words</option>
                  <option value="advanced">Advanced · the most precise word</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void nameWithAi()} disabled={!chosen.length || Boolean(busy)}>
                  {busy === 'name' ? 'Naming…' : `Name ${chosen.length || ''} chosen (one mosaic)`}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void findWithAi()} disabled={Boolean(busy)}>
                  {busy === 'find' ? 'Asking…' : 'Compare: AI only (whole photo)'}
                </Button>
              </div>
              {mosaicUrl && (
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <img src={mosaicUrl} alt="The mosaic sent to the AI" className="w-full max-w-60 self-start rounded-lg border border-line" />
                  <ol className="min-w-0 flex-1 space-y-3 text-sm">
                    {chosen.map((c, i) => {
                      const n = names?.get(i + 1)
                      const kept = picks[i + 1] ?? []
                      return (
                        <li key={i} className="flex gap-2">
                          <span className="w-5 shrink-0 pt-1 font-semibold text-muted">{i + 1}</span>
                          {n?.words.length ? (
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap gap-1.5">
                                {n.words.map((w, k) => {
                                  const on = kept.includes(k)
                                  return (
                                    <button
                                      key={k}
                                      type="button"
                                      onClick={() => togglePick(i + 1, k)}
                                      aria-pressed={on}
                                      className={`rounded-xl border px-2.5 py-1 text-left ${on ? 'border-accent bg-accent/10' : 'border-line bg-paper'}`}
                                    >
                                      <span lang="zh-Hant" className="text-base font-semibold">
                                        {w.hanzi}
                                      </span>{' '}
                                      <span>{w.pinyin}</span>
                                      {w.level && <span className="ml-1.5 rounded bg-sunken px-1 text-[10px] font-semibold text-muted">{w.level}</span>}
                                      <span className="block text-xs text-muted">
                                        {on ? '✓ ' : ''}
                                        {w.meaning} · {w.kind === 'everyday' ? 'everyday word' : 'more precise'}
                                      </span>
                                    </button>
                                  )
                                })}
                              </div>
                              {n.category && (
                                <p className="mt-1 text-xs text-muted">
                                  Tag: <span lang="zh-Hant">{n.category.hanzi}</span> {n.category.pinyin} · {n.category.meaning}
                                </p>
                              )}
                              {kept.length > 1 && (
                                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Two cards. Very similar words learned on the same days can get mixed up; adding the second one later can help.</p>
                              )}
                            </div>
                          ) : (
                            <span className="pt-1 text-muted">{busy === 'name' ? '…' : n ? 'Not recognised' : SOURCE_TEXT[c.source]}</span>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </div>
              )}
              {found && (
                <div className="mt-3 text-sm">
                  <label className="mb-1 flex items-center gap-2">
                    <input type="checkbox" checked={showFound} onChange={(e) => setShowFound(e.target.checked)} /> Show the AI’s boxes on the photo (dashed blue)
                  </label>
                  <p lang="zh-Hant">{found.map((f) => `${f.hanzi} ${f.pinyin}`).join(' · ') || 'Nothing found.'}</p>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <section className={sectionClass}>
        <h2 className="mb-2 font-semibold">4 · Report</h2>
        <pre className="max-h-72 overflow-auto rounded-xl bg-sunken p-3 text-xs whitespace-pre-wrap">{text}</pre>
        <Button
          size="sm"
          className="mt-3"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }
        >
          {copied ? 'Copied' : 'Copy report'}
        </Button>
      </section>

      {editing !== undefined && photo && (
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
            else choose(chosen.map((c, j) => (j === editing ? { ...c, box, adjusted: true } : c)))
            setEditing(undefined)
            return undefined
          }}
          onRemove={
            editing === 'new'
              ? undefined
              : async () => {
                  choose(chosen.filter((_, j) => j !== editing))
                  setEditing(undefined)
                }
          }
          removeLabel="Remove this object"
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  )
}

/** One preselected word per named object, for the learner's level. */
function defaultPicks(named: ReadonlyMap<number, ObjectWords>, learner: LearnerLevel): Record<number, number[]> {
  return Object.fromEntries([...named].filter(([, n]) => n.words.length).map(([index, n]) => [index, [defaultChoice(n.words, learner)]]))
}

/** A small preview of one box of the photo. */
function CropThumb({ photo, box, size }: { photo: HTMLCanvasElement; box: NormBox; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const [y0, x0, y1, x1] = box.map((v, k) => (v / 1000) * (k % 2 ? photo.width : photo.height))
    const w = x1! - x0!
    const h = y1! - y0!
    const scale = Math.min(size / w, size / h)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(photo, x0!, y0!, w, h, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale)
  }, [photo, box, size])
  return <canvas ref={ref} width={size} height={size} className="shrink-0 rounded-md bg-sunken" style={{ width: size, height: size }} />
}
