import { useSyncExternalStore } from 'react'
import { getUsage, resetUsage, subscribeUsage, totalUsage } from '@/lib/aiUsage'
import { Button } from '@/ui/Button'
import { shortDateTime } from '@/ui/format'
import { usageLine } from '@/ui/usageText'

/** What the importer sent from this device: the last import and totals per model. */
export function UsagePanel() {
  const usage = useSyncExternalStore(subscribeUsage, getUsage)
  const total = totalUsage(usage)
  const models = Object.entries(usage.byModel).sort((a, b) => b[1].requests - a[1].requests)

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <h3 className="mb-1 font-semibold">Last import</h3>
        {usage.lastRun ? (
          <p className="text-muted">
            <span className="text-ink">{usage.lastRun.fileName || 'PDF'}</span> · {shortDateTime(usage.lastRun.startedAt)} ·{' '}
            {usage.lastRun.model}
            <br />
            {usageLine(usage.lastRun)}
          </p>
        ) : (
          <p className="text-muted">No import yet.</p>
        )}
      </div>

      <div>
        <h3 className="mb-1 font-semibold">Total since {shortDateTime(usage.since)}</h3>
        {models.length === 0 ? (
          <p className="text-muted">Nothing used yet.</p>
        ) : (
          <>
            <ul className="mb-1 flex flex-col gap-1">
              {models.map(([key, t]) => (
                <li key={key} className="text-muted">
                  <span className="font-mono text-xs text-ink">{key}</span>
                  <br />
                  {usageLine(t)}
                </li>
              ))}
            </ul>
            <p className="font-medium">All: {usageLine(total)}</p>
          </>
        )}
      </div>

      <p className="text-xs text-muted">
        Counts only what this app sent from this device. Gemini’s and OpenRouter’s free tiers don’t charge; Claude costs are estimated from list
        prices — your provider’s dashboard has the exact bill.
      </p>
      {models.length > 0 && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => confirm('Reset the usage counters on this device?') && resetUsage()}>
            Reset counters
          </Button>
        </div>
      )}
    </div>
  )
}
