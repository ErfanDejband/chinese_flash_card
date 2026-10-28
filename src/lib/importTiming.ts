import type { ProviderConfig } from '@/import/ai/types'

/**
 * How long a page usually takes, per service and model, for "about 3 min left" while importing.
 * The last few successful page durations of real runs (not the demo), on this device only:
 * localStorage, never synced or backed up.
 */
type Timings = Record<string, number[]>

const STORAGE_KEY = 'mandarin-leitner.import-timing'
/** Durations kept per model. */
const SAMPLES = 20
/** Models remembered; the least recently used is forgotten first. */
const MODELS = 20

/** `openrouter.ai·openrouter/free`, `gemini·gemini-3.8-flash`: the service and the configured model. */
export function timingKey(config: ProviderConfig): string {
  const service = config.provider === 'openai-compatible' ? config.baseUrl.replace(/^https?:\/\//, '').split('/')[0] : config.provider
  return `${service}·${config.model}`
}

function load(): Timings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Timings) : {}
  } catch {
    return {}
  }
}

/** Remember how long a page took (from its start to its drafts being saved, waits included). */
export function recordPageTime(key: string, ms: number): void {
  if (!(ms > 0)) return
  const timings = load()
  const samples = [...(Array.isArray(timings[key]) ? timings[key] : []), Math.round(ms)].slice(-SAMPLES)
  // Re-inserted last, so the keys stay in order of use.
  delete timings[key]
  timings[key] = samples
  const keys = Object.keys(timings)
  for (const old of keys.slice(0, Math.max(0, keys.length - MODELS))) delete timings[old]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timings))
  } catch {
    // Storage unavailable: no estimate next time.
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** The median page time for this service and model, once there are at least two pages to go by. */
export function typicalPageMs(key: string): number | undefined {
  const samples = load()[key]
  if (!Array.isArray(samples)) return undefined
  const valid = samples.filter((ms) => typeof ms === 'number' && ms > 0)
  return valid.length >= 2 ? median(valid) : undefined
}

/**
 * Time left for a run: the current page's typical time minus what it has taken so far (never
 * below zero), plus the typical time for each page still waiting.
 */
export function estimateRemainingMs(typicalMs: number, pagesWaiting: number, currentElapsedMs?: number): number {
  const current = currentElapsedMs === undefined ? 0 : Math.max(0, typicalMs - currentElapsedMs)
  return current + Math.max(0, pagesWaiting) * typicalMs
}

/** "about 40 s", "about 1 min", "about 12 min". */
export function formatAbout(ms: number): string {
  const s = ms / 1000
  if (s < 55) return `about ${Math.max(5, Math.round(s / 5) * 5)} s`
  return `about ${Math.max(1, Math.round(s / 60))} min`
}
