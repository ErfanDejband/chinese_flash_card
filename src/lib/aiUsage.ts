import type { RequestUsage } from '@/import/ai/types'

/**
 * AI usage of this app on this device (localStorage; not in backups). Providers don't expose
 * account-wide usage to a normal API key, so this counts what the importer sent.
 * Cost is only summed where it is known: reported by the provider, or estimated for Claude.
 */
export interface UsageTotals {
  requests: number
  inputTokens: number
  outputTokens: number
  /** Sum of known costs. */
  costUsd: number
  /** Requests whose cost is known (estimated or reported). */
  costedRequests: number
  estimated: boolean
}

export interface RunUsage extends UsageTotals {
  importId: string
  fileName: string
  provider: string
  model: string
  startedAt: number
  finishedAt?: number
}

export interface UsageState {
  since: number
  /** Keyed by `${provider} · ${model}`. */
  byModel: Record<string, UsageTotals>
  lastRun?: RunUsage
}

const STORAGE_KEY = 'mandarin-leitner.ai-usage'
const emptyTotals = (): UsageTotals => ({ requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, costedRequests: 0, estimated: false })

let cache: UsageState | undefined
const listeners = new Set<() => void>()

function load(now = Date.now()): UsageState {
  if (!cache) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as UsageState | null
      cache = stored && typeof stored.since === 'number' && stored.byModel ? stored : { since: now, byModel: {} }
    } catch {
      cache = { since: now, byModel: {} }
    }
  }
  return cache
}

function save(next: UsageState) {
  cache = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: keep in memory.
  }
  listeners.forEach((l) => l())
}

function add(t: UsageTotals, u: RequestUsage | undefined): UsageTotals {
  const known = u?.costUsd !== undefined
  return {
    requests: t.requests + 1,
    inputTokens: t.inputTokens + (u?.inputTokens ?? 0),
    outputTokens: t.outputTokens + (u?.outputTokens ?? 0),
    costUsd: t.costUsd + (u?.costUsd ?? 0),
    costedRequests: t.costedRequests + (known ? 1 : 0),
    estimated: t.estimated || u?.costSource === 'estimated',
  }
}

export function getUsage(): UsageState {
  return load()
}

export function subscribeUsage(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Begin a new "last import" summary (replacing the previous one). */
export function startRun(run: { importId: string; fileName: string; provider: string; model: string }, now = Date.now()): void {
  const state = load(now)
  save({ ...state, lastRun: { ...emptyTotals(), ...run, startedAt: now } })
}

export function finishRun(now = Date.now()): void {
  const state = load(now)
  if (state.lastRun) save({ ...state, lastRun: { ...state.lastRun, finishedAt: now } })
}

/** Count one successful model response (retries included: each request is billed). */
export function recordUsage(provider: string, model: string, usage: RequestUsage | undefined, now = Date.now()): void {
  const state = load(now)
  const key = `${provider} · ${model}`
  save({
    ...state,
    byModel: { ...state.byModel, [key]: add(state.byModel[key] ?? emptyTotals(), usage) },
    lastRun: state.lastRun && !state.lastRun.finishedAt ? { ...state.lastRun, ...add(state.lastRun, usage) } : state.lastRun,
  })
}

export function resetUsage(now = Date.now()): void {
  save({ since: now, byModel: {} })
}

export function totalUsage(state: UsageState): UsageTotals {
  return Object.values(state.byModel).reduce(
    (sum, t) => ({
      requests: sum.requests + t.requests,
      inputTokens: sum.inputTokens + t.inputTokens,
      outputTokens: sum.outputTokens + t.outputTokens,
      costUsd: sum.costUsd + t.costUsd,
      costedRequests: sum.costedRequests + t.costedRequests,
      estimated: sum.estimated || t.estimated,
    }),
    emptyTotals(),
  )
}

/** Test hook: forget the in-memory copy so the next read comes from storage. */
export function _resetUsageCache(): void {
  cache = undefined
}
