import { useSyncExternalStore } from 'react'
import { useNow } from '@/hooks/useBrowser'
import { formatMs, getTrace, subscribeTrace, summarizeTrace, traceReport } from '@/lib/importTrace'
import { ReportBox } from './ReportBox'

/** The last import, step by step: where the time went (for troubleshooting slow imports). */
export function ImportDetails() {
  const trace = useSyncExternalStore(subscribeTrace, getTrace)
  // Refreshes the "in all" time while a run is going.
  const now = useNow(trace && !trace.endedAt ? 1_000 : 60_000)
  if (!trace) return <p className="text-muted">The next import is recorded here step by step: each request, its time and any waits.</p>

  const s = summarizeTrace(trace, now)
  const tiles: [string, string][] = [
    ['per page (median)', s.medianPageMs !== undefined ? formatMs(s.medianPageMs) : '–'],
    ['waiting to retry', formatMs(s.waitMs)],
    ['failed requests', formatMs(s.failedRequestMs)],
  ]
  if (s.statsRequests > 0) tiles.push(['to first token', formatMs(s.firstTokenMs)], ['generating', formatMs(s.generationMs)])
  if (s.reasoningTokens > 0) tiles.push(['reasoning tokens', `${Math.round((s.reasoningTokens / Math.max(1, s.outputTokens)) * 100)}% of output`])

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line p-2">
            <dd className="font-semibold tabular-nums">{value}</dd>
            <dt className="text-xs text-muted">{label}</dt>
          </div>
        ))}
      </dl>
      <ReportBox text={traceReport(trace, now)} />
    </div>
  )
}
