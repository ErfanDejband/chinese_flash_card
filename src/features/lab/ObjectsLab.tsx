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
import { area, iou, pickAt, visibleDetections, type Detection } from '@/vision/detections'
import { loadDetector, webGpuInfo, type Detector, type DetectorBackend, type DetectorDtype, type GpuInfo } from '@/vision/detector'
import { drawMosaic, MOSAIC_MAX, mosaicLayout } from '@/vision/mosaic'
import { reportText, type AiRun, type LabReport } from '@/vision/report'
import { nameInput, OBJECT_FIND_TASK, OBJECT_NAME_TASK, validateFound, validateNames, type FoundObject, type NamedObject } from '@/vision/tasks'

/** Long side of the photo the lab works on (the import sends the same size to the AI). */
const PHOTO_SIZE = 1536

interface Photo {
  canvas: HTMLCanvasElement
  blob: Blob
  url: string
  key: string
}

interface Chosen {
  box: NormBox
  /** The detector's guess, sent to the AI as a hint. */
  label?: string
  source: 'detector' | 'tapped' | 'drawn'
}

const selectClass = 'h-10 rounded-xl border border-line bg-paper px-2 text-sm outline-none focus:border-accent'
const sectionClass = 'mb-4 rounded-3xl border border-line bg-surface p-4'

const boxStyle = (b: NormBox) => ({ top: `${b[0] / 10}%`, left: `${b[1] / 10}%`, height: `${(b[2] - b[0]) / 10}%`, width: `${(b[3] - b[1]) / 10}%` })

const contains = (b: NormBox, x: number, y: number) => y >= b[0] && y <= b[2] && x >= b[1] && x <= b[3]

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
  const [loaded, setLoaded] = useState<string>()
  const [loading, setLoading] = useState<{ loaded: number; total: number }>()
  const [error, setError] = useState<string>()
  const [photo, setPhoto] = useState<Photo>()
  const [all, setAll] = useState<Detection[]>([])
  const [detecting, setDetecting] = useState(false)
  const [threshold, setThreshold] = useState(0.35)
  const [chosen, setChosen] = useState<Chosen[]>([])
  const [drawing, setDrawing] = useState(false)
  const [note, setNote] = useState<string>()
  const [mosaicUrl, setMosaicUrl] = useState<string>()
  const [names, setNames] = useState<Map<number, NamedObject>>()
  const [found, setFound] = useState<FoundObject[]>()
  const [showFound, setShowFound] = useState(true)
  const [busy, setBusy] = useState<'name' | 'find'>()
  const [report, setReport] = useState<LabReport>({ build: versionLabel(), userAgent: navigator.userAgent, webgpu: { available: false }, loads: [], detects: [] })
  const [copied, setCopied] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)

  const config = activeProviderConfig(getAiSettings())
  const aiProblems = configProblems(config)
  const service = serviceLabel(config)
  const visible = visibleDetections(all, threshold)

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
  // fp16 suits a GPU that has half-precision shaders (fp32 otherwise); the quantised model is
  // smaller and quicker on the CPU.
  const autoDtype: DetectorDtype = chosenBackend === 'webgpu' ? (gpu?.fp16 ? 'fp16' : 'fp32') : 'q8'
  const chosenDtype: DetectorDtype = dtype === 'auto' ? autoDtype : dtype

  async function detect(d: Detector, p: Photo) {
    setDetecting(true)
    setError(undefined)
    try {
      const result = await d.detect(p.canvas)
      setAll(result.detections)
      const shown = visibleDetections(result.detections, threshold).length
      setReport((r) => ({ ...r, detects: [...r.detects, { backend: d.backend, dtype: d.dtype, ms: result.ms, candidates: result.detections.length, shown, threshold }] }))
    } catch (e) {
      setError(`Detection failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDetecting(false)
    }
  }

  async function load() {
    setError(undefined)
    setLoading({ loaded: 0, total: 0 })
    try {
      setDetector(undefined)
      setLoaded(undefined)
      const { detector: d, report: r } = await loadDetector(chosenBackend, chosenDtype, (l, t) => setLoading({ loaded: l, total: t }))
      setDetector(d)
      setLoaded(`${d.dtype} on ${d.backend === 'webgpu' ? 'WebGPU' : 'WASM (CPU)'}`)
      setReport((rep) => ({ ...rep, loads: [...rep.loads, r] }))
      if (photo) await detect(d, photo)
    } catch (e) {
      setError(`Loading the model failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(undefined)
    }
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
      setReport((r) => ({ ...r, photo: { width: canvas.width, height: canvas.height }, selection: undefined, naming: undefined, findAll: undefined }))
      if (detector) await detect(detector, next)
    } catch {
      setError('This photo could not be read (HEIC photos need a browser that can open them).')
    }
  }

  function choose(next: Chosen[]) {
    setChosen(next)
    setNames(undefined)
    const count = (s: Chosen['source']) => next.filter((c) => c.source === s).length
    setReport((r) => ({ ...r, selection: { detector: count('detector'), tapped: count('tapped'), drawn: count('drawn') } }))
  }

  function onTap(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 1000
    const y = ((e.clientY - rect.top) / rect.height) * 1000
    setNote(undefined)
    // Whatever is smallest under the finger wins: a chosen box (tap = drop it), a drawn box, or
    // one of the detector's weaker guesses. So a tap on a remote inside a chosen cat adds the remote.
    const isChosen = (b: NormBox) => chosen.some((c) => iou(c.box, b) > 0.8)
    const weak = pickAt(all, x, y)
    const options: { box: NormBox; drop?: Chosen; add?: Chosen }[] = [
      ...chosen.filter((c) => contains(c.box, x, y)).map((c) => ({ box: c.box, drop: c })),
      ...visible.filter((d) => contains(d.box, x, y) && !isChosen(d.box)).map((d) => ({ box: d.box, add: { box: d.box, label: d.label, source: 'detector' as const } })),
      ...(weak && !isChosen(weak.box) && !visible.includes(weak) ? [{ box: weak.box, add: { box: weak.box, label: weak.label, source: 'tapped' as const } }] : []),
    ]
    const target = options.sort((a, b) => area(a.box) - area(b.box))[0]
    if (target?.drop) return choose(chosen.filter((c) => c !== target.drop))
    if (!target?.add) return setNote(all.length ? 'Nothing found there: draw a box around it instead.' : 'Load the model first, or draw a box.')
    if (chosen.length >= MOSAIC_MAX) return setNote(`One mosaic holds up to ${MOSAIC_MAX} objects.`)
    choose([...chosen, target.add])
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
      return { run: { service, model: config.model, ms: Math.round(performance.now() - started), error: e instanceof Error ? e.message : String(e) } }
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
    let list: string[] = []
    if (res) {
      try {
        const named = validateNames(parseModelJson(res.text), chosen.length)
        setNames(named)
        list = chosen.map((_, i) => {
          const n = named.get(i + 1)
          return n ? `${i + 1} ${n.hanzi || '?'} ${n.pinyin} ${n.meaning} (${n.confidence})` : `${i + 1} (no answer)`
        })
      } catch (e) {
        run.error = e instanceof Error ? e.message : 'unreadable reply'
      }
    }
    setReport((r) => ({ ...r, naming: { ...run, mosaic: { width: mosaic.width, height: mosaic.height }, names: list } }))
    setBusy(undefined)
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
        run.error = e instanceof Error ? e.message : 'unreadable reply'
      }
    }
    const image = { width: photo.canvas.width, height: photo.canvas.height }
    setReport((r) => ({ ...r, findAll: { ...run, image, found: objects.map((o) => `${o.hanzi} ${o.pinyin}`) } }))
    setBusy(undefined)
  }

  const text = reportText(report)

  return (
    <div>
      <PageHeader title="Objects lab" subtitle="Test page for the camera tab. Nothing here makes cards." back="/" />

      <section className={sectionClass}>
        <h2 className="mb-1 font-semibold">1 · Object detector on this device</h2>
        <p className="mb-3 text-sm text-muted">
          D-FINE-S (365 kinds of everyday things). The first load downloads 15–45 MB from Hugging Face and jsDelivr; later loads come from the browser cache.
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
              fp16 · 21 MB
            </option>
            <option value="fp32">fp32 · 42 MB</option>
          </select>
          <Button size="sm" onClick={() => void load()} disabled={Boolean(loading)}>
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
            <Button size="sm" variant="ghost" onClick={() => detector && void detect(detector, photo)} disabled={!detector || detecting}>
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
              {visible.map((d, i) => (
                <div key={`d${i}`} className="pointer-events-none absolute border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" style={boxStyle(d.box)}>
                  <span className="absolute top-0 left-0 bg-black/60 px-1 text-[10px] leading-4 text-white">{d.label}</span>
                </div>
              ))}
              {showFound &&
                found?.map((f, i) => (
                  <div key={`f${i}`} className="pointer-events-none absolute border-2 border-dashed border-sky-400" style={boxStyle(f.box)}>
                    <span className="absolute right-0 bottom-0 bg-sky-600/80 px-1 text-xs text-white">{f.hanzi}</span>
                  </div>
                ))}
              {chosen.map((c, i) => (
                <div key={`c${i}`} className="pointer-events-none absolute border-[3px] border-accent" style={boxStyle(c.box)}>
                  <span className="absolute -top-px -left-px grid size-6 place-items-center bg-accent text-xs font-bold text-on-accent">{i + 1}</span>
                </div>
              ))}
              {detecting && <div className="absolute inset-0 grid place-items-center bg-black/30 text-sm font-semibold text-white">Detecting…</div>}
            </div>
            <p className="mt-2 text-sm text-muted">
              Tap a box to choose it (tap again to drop it). Tap anything else to try the detector’s weaker guesses there.
              {all.length > 0 && ` ${visible.length} shown of ${all.length} candidates.`}
            </p>
            {note && <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">{note}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex flex-1 items-center gap-2 text-sm">
                Show from {threshold.toFixed(2)}
                <input type="range" min={0.05} max={0.9} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="flex-1 accent-accent" />
              </label>
              <Button size="sm" variant="secondary" onClick={() => setDrawing(true)} disabled={chosen.length >= MOSAIC_MAX}>
                Draw a box
              </Button>
            </div>
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
                  <ol className="flex-1 space-y-1 text-sm">
                    {chosen.map((c, i) => {
                      const n = names?.get(i + 1)
                      return (
                        <li key={i} className="flex gap-2">
                          <span className="w-5 shrink-0 font-semibold text-muted">{i + 1}</span>
                          {n ? (
                            <span>
                              <span lang="zh-Hant" className="text-base font-semibold">
                                {n.hanzi || '?'}
                              </span>{' '}
                              {n.pinyin} · {n.meaning} <span className="text-muted">({n.confidence})</span>
                            </span>
                          ) : (
                            <span className="text-muted">{busy === 'name' ? '…' : (c.label ?? 'drawn')}</span>
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

      {drawing && photo && (
        <BoxEditor
          image={photo.blob}
          imageKey={photo.key}
          aspectRatio={`${photo.canvas.width} / ${photo.canvas.height}`}
          imageLabel="Your photo"
          title="Draw a box around the object"
          initialBox={null}
          otherBoxes={chosen.map((c) => c.box)}
          onSave={async (box) => {
            choose([...chosen, { box, source: 'drawn' }])
            setDrawing(false)
            return undefined
          }}
          onClose={() => setDrawing(false)}
        />
      )}
    </div>
  )
}
