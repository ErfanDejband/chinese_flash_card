import type { LoadReport } from './detector'

/** One AI request the lab made, as measured. */
export interface AiRun {
  service: string
  model: string
  ms: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  error?: string
}

export interface DetectRun {
  backend: string
  dtype: string
  ms: number
  candidates: number
  /** Boxes offered on the photo, and big things listed apart. */
  suggested: number
  big: number
  /** The best score: near 0 means this setup's numbers are broken on the device (fp16 on some GPUs). */
  best: number
}

/** One setup measured by the lab's benchmark on the same photo. */
export interface BenchmarkRow {
  backend: string
  dtype: string
  load?: LoadReport
  /** Detection times in order: the first includes warm-up. */
  times: number[]
  suggested: number
  best: number
  error?: string
}

/** Everything the objects lab measured in one session, for the copyable report. */
export interface LabReport {
  build: string
  userAgent: string
  webgpu: { available: boolean; adapter?: string; fp16?: boolean }
  loads: LoadReport[]
  photo?: { width: number; height: number }
  /** How suggestions were shown, and how many were offered. */
  view?: { style: string; max: number }
  /** The "My level" setting that preselects words. */
  learner?: string
  detects: DetectRun[]
  /** How each chosen object was picked; `adjusted` counts boxes moved afterwards. */
  selection?: { detector: number; big: number; tapped: number; empty: number; drawn: number; adjusted: number }
  benchmark?: BenchmarkRow[]
  naming?: AiRun & { mosaic: { width: number; height: number }; names: string[] }
  findAll?: AiRun & { image: { width: number; height: number }; found: string[] }
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`

function aiLine(run: AiRun): string {
  if (run.error) return `${run.service} · ${run.model}: failed after ${seconds(run.ms)} (${run.error})`
  const tokens = run.inputTokens === undefined ? 'tokens not reported' : `${run.inputTokens} in / ${run.outputTokens ?? 0} out tokens`
  const cost = run.costUsd === undefined ? '' : ` · $${run.costUsd.toFixed(4)}`
  return `${run.service} · ${run.model}: ${seconds(run.ms)} · ${tokens}${cost}`
}

/** Plain text to paste back into the chat. */
export function reportText(r: LabReport): string {
  const lines = [`Objects lab report · build ${r.build}`, `Browser: ${r.userAgent}`]
  const gpu = r.webgpu
  lines.push(`WebGPU: ${gpu.available ? `yes${gpu.adapter ? ` (${gpu.adapter})` : ''}, ${gpu.fp16 ? 'fp16' : 'no fp16'}` : 'no'}`)
  for (const l of r.loads) {
    const from = l.cached ? 'from the browser cache' : `downloaded ${mb(l.bytes)}`
    lines.push(`Model load: ${l.dtype} on ${l.backend} · ${seconds(l.ms)} · ${from}`)
  }
  if (r.photo) lines.push(`Photo: ${r.photo.width}×${r.photo.height}`)
  if (r.view) lines.push(`View: ${r.view.style} · suggest up to ${r.view.max}`)
  for (const d of r.detects) {
    lines.push(`Detect: ${d.ms} ms on ${d.backend} (${d.dtype}) · ${d.suggested} suggested + ${d.big} big · best ${d.best.toFixed(2)} · ${d.candidates} candidates`)
  }
  if (r.benchmark?.length) {
    lines.push('Benchmark (same photo):')
    for (const b of r.benchmark) {
      if (b.error) {
        lines.push(`  ${b.backend} ${b.dtype}: failed (${b.error})`)
        continue
      }
      const load = b.load ? `load ${seconds(b.load.ms)}${b.load.cached ? ' (cache)' : ` (${mb(b.load.bytes)})`} · ` : ''
      lines.push(`  ${b.backend} ${b.dtype}: ${load}detect ${b.times.join(' / ')} ms · ${b.suggested} suggested · best ${b.best.toFixed(2)}`)
    }
  }
  if (r.selection) {
    const s = r.selection
    const total = s.detector + s.big + s.tapped + s.empty + s.drawn
    lines.push(
      `Chosen: ${total} (${s.detector} suggested, ${s.big} big, ${s.tapped} tapped weaker guesses, ${s.empty} tapped empty spots, ${s.drawn} drawn; ${s.adjusted} adjusted)`,
    )
  }
  if (r.naming) {
    lines.push(`Name with AI (mosaic ${r.naming.mosaic.width}×${r.naming.mosaic.height}): ${aiLine(r.naming)}`)
    if (r.learner) lines.push(`  My level: ${r.learner} (✓ = kept)`)
    r.naming.names.forEach((n) => lines.push(`  ${n}`))
  }
  if (r.findAll) {
    lines.push(`AI only (photo ${r.findAll.image.width}×${r.findAll.image.height}): ${aiLine(r.findAll)}`)
    if (r.findAll.found.length) lines.push(`  found ${r.findAll.found.length}: ${r.findAll.found.join(', ')}`)
  }
  return lines.join('\n')
}
