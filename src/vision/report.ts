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
  shown: number
  threshold: number
}

/** Everything the objects lab measured in one session, for the copyable report. */
export interface LabReport {
  build: string
  userAgent: string
  webgpu: { available: boolean; adapter?: string; fp16?: boolean }
  loads: LoadReport[]
  photo?: { width: number; height: number }
  detects: DetectRun[]
  selection?: { detector: number; tapped: number; drawn: number }
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
  for (const d of r.detects) {
    lines.push(`Detect: ${d.ms} ms on ${d.backend} (${d.dtype}) · ${d.shown} shown at ≥ ${d.threshold} · ${d.candidates} candidates`)
  }
  if (r.selection) {
    const s = r.selection
    lines.push(`Chosen: ${s.detector + s.tapped + s.drawn} (${s.detector} from boxes, ${s.tapped} by tapping, ${s.drawn} drawn)`)
  }
  if (r.naming) {
    lines.push(`Name with AI (mosaic ${r.naming.mosaic.width}×${r.naming.mosaic.height}): ${aiLine(r.naming)}`)
    r.naming.names.forEach((n) => lines.push(`  ${n}`))
  }
  if (r.findAll) {
    lines.push(`AI only (photo ${r.findAll.image.width}×${r.findAll.image.height}): ${aiLine(r.findAll)}`)
    if (r.findAll.found.length) lines.push(`  found ${r.findAll.found.length}: ${r.findAll.found.join(', ')}`)
  }
  return lines.join('\n')
}
