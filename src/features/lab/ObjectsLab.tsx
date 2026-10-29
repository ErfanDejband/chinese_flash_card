import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ObjectPicker } from '@/features/snap/ObjectPicker'
import { readPhoto, BIG_AREA, type Chosen, type Photo } from '@/features/snap/photo'
import { WordChoices } from '@/features/snap/WordChoices'
import { configProblems, createProvider, serviceLabel } from '@/import/ai/createProvider'
import { bytesToBase64 } from '@/import/ai/http'
import { parseModelJson } from '@/import/ai/parse'
import type { JsonTask } from '@/import/ai/prompt'
import type { PageResponse } from '@/import/ai/types'
import { canvasToBlob } from '@/import/render'
import { activeProviderConfig, getAiSettings } from '@/lib/aiConfig'
import { recordUsage } from '@/lib/aiUsage'
import { versionLabel } from '@/lib/appBuild'
import { Button } from '@/ui/Button'
import { PageHeader } from '@/ui/PageHeader'
import { preselectAll } from '@/vision/cards'
import { suggestObjects, type Detection } from '@/vision/detections'
import { loadDetector, webGpuInfo, type Detector, type DetectorBackend, type DetectorDtype, type DetectorSource, type GpuInfo } from '@/vision/detector'
import { drawMosaic, mosaicLayout } from '@/vision/mosaic'
import { reportText, type AiRun, type BenchmarkRow, type LabReport } from '@/vision/report'
import { nameInput, OBJECT_FIND_TASK, OBJECT_NAME_TASK, validateFound, validateNames, type FoundObject, type LearnerLevel, type ObjectWords } from '@/vision/tasks'

const selectClass = 'h-10 rounded-xl border border-line bg-paper px-2 text-sm outline-none focus:border-accent'
const sectionClass = 'mb-4 rounded-3xl border border-line bg-surface p-4'
const boxStyle = (b: FoundObject['box']) => ({ top: `${b[0] / 10}%`, left: `${b[1] / 10}%`, height: `${(b[2] - b[0]) / 10}%`, width: `${(b[3] - b[1]) / 10}%` })
const backendName = (b: DetectorBackend) => (b === 'webgpu' ? 'WebGPU' : 'WASM (CPU)')
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** The app hosts the int8 and fp32 models (Snap); fp16 only comes from Hugging Face. */
const sourceOf = (dtype: DetectorDtype): DetectorSource => (dtype === 'fp16' ? 'hub' : 'app')
const noneTaken = { inDeck: new Set<string>(), known: new Set<string>() }

/**
 * Test page for Snap (/lab/objects, not in the menu): the same picker and word choices, plus
 * model setups to compare, a benchmark, "AI only" on the whole photo, and a copyable report.
 * Nothing here creates cards.
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
  const [view, setView] = useState<'dots' | 'boxes'>('dots')
  const [maxSuggest, setMaxSuggest] = useState(6)
  const [chosen, setChosen] = useState<Chosen[]>([])
  const [mosaicUrl, setMosaicUrl] = useState<string>()
  const [names, setNames] = useState<Map<number, ObjectWords>>()
  const [picks, setPicks] = useState<Record<number, number[]>>({})
  const [learner, setLearner] = useState<LearnerLevel>('beginner')
  const [found, setFound] = useState<FoundObject[]>()
  const [showFound, setShowFound] = useState(true)
  const [busy, setBusy] = useState<'name' | 'find'>()
  const [benchmarking, setBenchmarking] = useState<string>()
  const [report, setReport] = useState<LabReport>({ build: versionLabel(), userAgent: navigator.userAgent, webgpu: { available: false }, loads: [], detects: [] })
  const [copied, setCopied] = useState(false)
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)

  const config = activeProviderConfig(getAiSettings())
  const aiProblems = configProblems(config)
  const service = serviceLabel(config)
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

  async function load() {
    setError(undefined)
    setLoading({ loaded: 0, total: 0 })
    try {
      setDetector(undefined)
      const { detector: d, report: r } = await loadDetector(chosenBackend, chosenDtype, { source: sourceOf(chosenDtype), onProgress: (l, t) => setLoading({ loaded: l, total: t }) })
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
        const { detector: det, report: loadReport } = await loadDetector(b, d, { source: sourceOf(d) })
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
      const next = await readPhoto(file)
      setPhoto(next)
      setAll([])
      setChosen([])
      setNames(undefined)
      setFound(undefined)
      setMosaicUrl(undefined)
      setReport((r) => ({ ...r, photo: { width: next.canvas.width, height: next.canvas.height }, selection: undefined, naming: undefined, findAll: undefined, benchmark: undefined }))
      if (detector) await detect(detector, next)
    } catch {
      setError('This photo could not be read (HEIC photos need a browser that can open them).')
    }
  }

  function choose(next: Chosen[]) {
    setChosen(next)
    setNames(undefined)
    const count = (s: Chosen['source']) => next.filter((c) => c.source === s).length
    const selection = { detector: count('detector'), big: count('big'), tapped: count('tapped'), empty: count('empty'), drawn: count('drawn'), adjusted: next.filter((c) => c.adjusted).length }
    setReport((r) => ({ ...r, selection }))
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
        setPicks(preselectAll(named, learner, noneTaken))
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
      return { ...p, [index]: current.includes(word) ? current.filter((w) => w !== word) : [...current, word].sort() }
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

  const text = reportText({ ...report, view: { style: view, max: maxSuggest }, learner, naming: report.naming && { ...report.naming, names: nameLines() } })
  const loaded = detector && `${detector.dtype} on ${backendName(detector.backend)}`
  const lastRun = report.detects.at(-1)

  return (
    <div>
      <PageHeader title="Objects lab" subtitle="Test page for Snap. Nothing here makes cards." back="/" />

      <section className={sectionClass}>
        <h2 className="mb-1 font-semibold">1 · Object detector on this device</h2>
        <p className="mb-3 text-sm text-muted">
          D-FINE-S (365 kinds of everyday things). int8 and fp32 come from this app’s site, fp16 from Hugging Face; later loads come from the browser cache.
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
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">This setting found nothing on this device (fp16 does this on some phones). Try fp32 or int8.</p>
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
          <div className="mt-3">
            <ObjectPicker
              photo={photo}
              detections={all}
              detecting={detecting}
              chosen={chosen}
              onChange={choose}
              view={view}
              onView={setView}
              maxSuggest={maxSuggest}
              onMaxSuggest={setMaxSuggest}
              threshold={threshold}
              showLabels={showLabels}
              overlay={
                showFound &&
                found?.map((f, i) => (
                  <div key={`f${i}`} className="pointer-events-none absolute border-2 border-dashed border-sky-400" style={boxStyle(f.box)}>
                    <span className="absolute right-0 bottom-0 bg-sky-600/80 px-1 text-xs text-white">{f.hanzi}</span>
                  </div>
                ))
              }
            />
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
          </div>
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
                    if (names) setPicks(preselectAll(names, next, noneTaken))
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
                  <div className="min-w-0 flex-1">
                    <WordChoices photo={photo} chosen={chosen} names={names} picks={picks} onToggle={togglePick} busy={busy === 'name'} />
                  </div>
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
    </div>
  )
}
