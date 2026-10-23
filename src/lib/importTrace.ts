import type { GenerationStats } from '@/import/ai/openrouterAuth'
import { ModelOutputError } from '@/import/ai/parse'
import { ProviderError } from '@/import/ai/types'
import type { AttemptEvent } from '@/import/extract/runExtraction'

/**
 * The last import on this device, step by step: every model request (failed ones too), every wait,
 * and OpenRouter's own timings. For finding out where the time goes ("Copy report" in Settings →
 * AI usage). localStorage only, never synced or backed up; holds no page images, texts or keys.
 */
export interface AttemptStep {
  kind: 'attempt'
  at: number
  ms: number
  outcome: 'ok' | 'error' | 'bad-json'
  errorKind?: string
  status?: number
  message?: string
  model?: string
  provider?: string
  generationId?: string
  jsonFallback?: boolean
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  finishReason?: string
  /** OpenRouter's numbers, fetched a few seconds after the request. */
  stats?: GenerationStats
}

export interface WaitStep {
  kind: 'wait'
  ms: number
  reason: string
}

export type TraceStep = AttemptStep | WaitStep

export interface PageTrace {
  page: number
  label: string
  startedAt: number
  endedAt?: number
  imageBytes?: number
  result?: 'done' | 'failed'
  items?: number
  error?: string
  steps: TraceStep[]
}

export interface RunTrace {
  fileName: string
  mode: string
  /** As configured, e.g. `openai-compatible · openrouter/free`. */
  service: string
  startedAt: number
  endedAt?: number
  /** Why the run ended early: paused, a used-up quota, a rejected key… */
  stopped?: string
  pages: PageTrace[]
}

const STORAGE_KEY = 'mandarin-leitner.import-trace'
const MESSAGE_LENGTH = 300

let cache: RunTrace | null | undefined
const listeners = new Set<() => void>()

export function getTrace(): RunTrace | null {
  if (cache === undefined) {
    try {
      cache = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as RunTrace | null
    } catch {
      cache = null
    }
  }
  return cache
}

function save(next: RunTrace) {
  cache = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: keep it in memory.
  }
  listeners.forEach((l) => l())
}

export function subscribeTrace(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function updatePage(page: number, change: (p: PageTrace) => PageTrace) {
  const trace = getTrace()
  if (!trace) return
  // The latest entry for the page: a retried page starts a new one.
  const i = trace.pages.findLastIndex((p) => p.page === page)
  if (i < 0) return
  save({ ...trace, pages: trace.pages.map((p, j) => (j === i ? change(p) : p)) })
}

export function startTrace(run: Pick<RunTrace, 'fileName' | 'mode' | 'service'>, now = Date.now()): void {
  save({ ...run, startedAt: now, pages: [] })
}

export function tracePageStart(page: number, label: string, now = Date.now()): void {
  const trace = getTrace()
  if (trace) save({ ...trace, pages: [...trace.pages, { page, label, startedAt: now, steps: [] }] })
}

/** A step for one model request, from what the extraction reported. */
export function attemptStep(e: AttemptEvent): AttemptStep {
  const r = e.response
  const error = e.error
  return {
    kind: 'attempt',
    at: e.startedAt,
    ms: e.ms,
    outcome: error === undefined ? 'ok' : r ? 'bad-json' : 'error',
    ...(error instanceof ProviderError && { errorKind: error.kind, status: error.status }),
    ...(error instanceof ModelOutputError && { errorKind: 'bad-json' }),
    ...(error !== undefined && { message: (error instanceof Error ? error.message : String(error)).slice(0, MESSAGE_LENGTH) }),
    ...(r && {
      model: r.model,
      provider: r.meta?.provider,
      generationId: r.meta?.id,
      jsonFallback: r.meta?.jsonFallback,
      inputTokens: r.usage?.inputTokens,
      outputTokens: r.usage?.outputTokens,
      reasoningTokens: r.meta?.reasoningTokens,
      finishReason: r.meta?.finishReason,
    }),
  }
}

export function traceAttempt(e: AttemptEvent): void {
  updatePage(e.page, (p) => ({ ...p, imageBytes: e.imageBytes, steps: [...p.steps, attemptStep(e)] }))
}

export function traceWait(page: number, ms: number, reason: string): void {
  updatePage(page, (p) => ({ ...p, steps: [...p.steps, { kind: 'wait', ms, reason }] }))
}

export function tracePageEnd(page: number, end: { items: number } | { error: string }, now = Date.now()): void {
  updatePage(page, (p) => ({
    ...p,
    endedAt: now,
    ...('items' in end ? { result: 'done', items: end.items } : { result: 'failed', error: end.error.slice(0, MESSAGE_LENGTH) }),
  }))
}

/** OpenRouter's stats arrive after the request (and maybe after the run): attach them to their attempt. */
export function traceStats(generationId: string, stats: GenerationStats): void {
  const trace = getTrace()
  if (!trace) return
  let found = false
  const pages = trace.pages.map((p) => ({
    ...p,
    steps: p.steps.map((s) => {
      if (s.kind !== 'attempt' || s.generationId !== generationId) return s
      found = true
      return { ...s, stats }
    }),
  }))
  if (found) save({ ...trace, pages })
}

export function finishTrace(stopped?: string, now = Date.now()): void {
  const trace = getTrace()
  if (trace) save({ ...trace, endedAt: now, ...(stopped && { stopped: stopped.slice(0, MESSAGE_LENGTH) }) })
}

/** Forget the cached copy (tests). */
export function _resetTraceCache(): void {
  cache = undefined
}

// ---- Analysis ---------------------------------------------------------------------------

export interface ModelShare {
  model: string
  requests: number
  ok: number
  ms: number
}

export interface TraceSummary {
  pages: number
  done: number
  failed: number
  totalMs: number
  medianPageMs?: number
  /** Time inside model requests: all of them, and the failed ones. */
  requestMs: number
  failedRequestMs: number
  /** Time waiting before a retry. */
  waitMs: number
  /** From OpenRouter's stats, over the requests that have them: time to the first token, and generating. */
  statsRequests: number
  generationMs: number
  firstTokenMs: number
  outputTokens: number
  reasoningTokens: number
  models: ModelShare[]
}

const attempts = (p: PageTrace) => p.steps.filter((s): s is AttemptStep => s.kind === 'attempt')
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function median(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1]! + s[mid]!) / 2
}

export function summarizeTrace(trace: RunTrace, now = Date.now()): TraceSummary {
  const all = trace.pages.flatMap(attempts)
  const withStats = all.filter((a) => a.stats?.latencyMs !== undefined && a.stats.generationMs !== undefined)
  const models = new Map<string, ModelShare>()
  for (const a of all) {
    const key = a.model ?? '(no reply)'
    const m = models.get(key) ?? { model: key, requests: 0, ok: 0, ms: 0 }
    models.set(key, { ...m, requests: m.requests + 1, ok: m.ok + (a.outcome === 'ok' ? 1 : 0), ms: m.ms + a.ms })
  }
  const ended = trace.pages.filter((p) => p.endedAt !== undefined)
  return {
    pages: trace.pages.length,
    done: trace.pages.filter((p) => p.result === 'done').length,
    failed: trace.pages.filter((p) => p.result === 'failed').length,
    totalMs: (trace.endedAt ?? now) - trace.startedAt,
    medianPageMs: median(ended.map((p) => p.endedAt! - p.startedAt)),
    requestMs: sum(all.map((a) => a.ms)),
    failedRequestMs: sum(all.filter((a) => a.outcome !== 'ok').map((a) => a.ms)),
    waitMs: sum(trace.pages.flatMap((p) => p.steps.filter((s) => s.kind === 'wait').map((s) => s.ms))),
    statsRequests: withStats.length,
    generationMs: sum(withStats.map((a) => a.stats!.generationMs!)),
    firstTokenMs: sum(withStats.map((a) => a.stats!.latencyMs!)),
    outputTokens: sum(all.map((a) => a.stats?.completionTokens ?? a.outputTokens ?? 0)),
    reasoningTokens: sum(all.map((a) => a.stats?.reasoningTokens ?? a.reasoningTokens ?? 0)),
    models: [...models.values()].sort((a, b) => b.requests - a.requests),
  }
}

/** "0.4 s", "12 s", "3 min 05 s" */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)} s`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}

const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const pct = (part: number, whole: number) => (whole > 0 ? ` (${Math.round((part / whole) * 100)}%)` : '')

function attemptLine(a: AttemptStep, n: number): string {
  const parts = [`${n}. ${formatMs(a.ms)}`, a.outcome === 'ok' ? 'ok' : `${a.outcome}${a.status ? ` ${a.status}` : ''}${a.errorKind && a.errorKind !== a.outcome ? ` ${a.errorKind}` : ''}`]
  if (a.model) parts.push(`${a.model}${a.provider ? ` @ ${a.provider}` : ''}`)
  if (a.inputTokens !== undefined || a.outputTokens !== undefined) {
    const reasoning = a.stats?.reasoningTokens ?? a.reasoningTokens
    parts.push(`${tokens(a.inputTokens ?? 0)} in / ${tokens(a.outputTokens ?? 0)} out${reasoning ? ` (${tokens(reasoning)} reasoning)` : ''}`)
  }
  if (a.jsonFallback) parts.push('sent twice (JSON mode refused)')
  if (a.finishReason && a.finishReason !== 'stop') parts.push(`finish: ${a.finishReason}`)
  const s = a.stats
  if (s?.latencyMs !== undefined) {
    const gen = s.generationMs
    const upstream = s.upstream && s.upstream.length > 1 ? `, ${s.upstream.length} upstream tries (${s.upstream.map((u) => u.status ?? '?').join(', ')})` : ''
    parts.push(`OpenRouter: first token after ${formatMs(s.latencyMs)}${gen !== undefined ? `, generating ${formatMs(gen)}` : ''}${upstream}`)
  }
  const line = parts.join(' · ')
  return a.message ? `${line}\n     ${a.message}` : line
}

/** The trace as plain text, for pasting into a message. */
export function traceReport(trace: RunTrace, now = Date.now()): string {
  const s = summarizeTrace(trace, now)
  const date = new Date(trace.startedAt).toISOString().slice(0, 16).replace('T', ' ')
  const lines = [
    'Mandarin Leitner · import report',
    `${date} UTC · ${trace.fileName} · ${trace.mode} · ${trace.service}`,
    `${s.pages} pages: ${s.done} done, ${s.failed} failed · ${formatMs(s.totalMs)} in all${s.medianPageMs !== undefined ? ` · median ${formatMs(s.medianPageMs)} per page` : ''}${trace.endedAt ? '' : ' · still running'}`,
    `Time in requests ${formatMs(s.requestMs)} (failed ones ${formatMs(s.failedRequestMs)}) · waiting to retry ${formatMs(s.waitMs)}`,
  ]
  if (s.statsRequests > 0) {
    lines.push(`OpenRouter (${s.statsRequests} requests): waiting for the first token ${formatMs(s.firstTokenMs)} · generating ${formatMs(s.generationMs)}`)
  }
  if (s.outputTokens > 0) lines.push(`Tokens out ${tokens(s.outputTokens)}, of which reasoning ${tokens(s.reasoningTokens)}${pct(s.reasoningTokens, s.outputTokens)}`)
  lines.push(`Models: ${s.models.map((m) => `${m.model} ${m.requests}× (${m.ok} ok, ${formatMs(m.ms)})`).join(' · ') || 'none'}`)
  if (trace.stopped) lines.push(`Stopped: ${trace.stopped}`)
  for (const p of trace.pages) {
    const result = p.result === 'done' ? `done, ${p.items} cards` : p.result === 'failed' ? 'failed' : 'unfinished'
    const took = p.endedAt !== undefined ? ` · ${formatMs(p.endedAt - p.startedAt)}` : ''
    const image = p.imageBytes !== undefined ? ` · image ${Math.round(p.imageBytes / 1024)} KB` : ''
    lines.push('', `${p.label} · ${result}${took}${image}`)
    let n = 0
    for (const step of p.steps) {
      lines.push(step.kind === 'wait' ? `   · waited ${formatMs(step.ms)} (${step.reason})` : `   ${attemptLine(step, ++n)}`)
    }
    if (p.error) lines.push(`   page error: ${p.error}`)
  }
  return lines.join('\n')
}
