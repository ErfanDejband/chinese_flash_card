import type { UsageTotals } from '@/lib/aiUsage'
import { formatTokens, formatUsd } from './format'

/** "~$0.12 estimated", "$0.12", or a note when the provider doesn't report cost. */
export function costText(t: UsageTotals): string {
  if (t.costedRequests === 0) return 'cost not reported'
  const partial = t.costedRequests < t.requests ? ' (partial)' : ''
  return t.estimated ? `~${formatUsd(t.costUsd)} estimated${partial}` : `${formatUsd(t.costUsd)}${partial}`
}

/** "6 requests · 14.2k in / 3.1k out tokens · ~$0.09 estimated" */
export function usageLine(t: UsageTotals): string {
  return `${t.requests} ${t.requests === 1 ? 'request' : 'requests'} · ${formatTokens(t.inputTokens)} in / ${formatTokens(t.outputTokens)} out tokens · ${costText(t)}`
}
