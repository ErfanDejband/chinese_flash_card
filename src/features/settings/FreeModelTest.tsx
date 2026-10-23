import { useSyncExternalStore } from 'react'
import { MAX_TEST_REQUESTS } from '@/import/ai/benchmark'
import { useAiSettings, useFreeQuota } from '@/hooks/useBrowser'
import { formatMs } from '@/lib/importTrace'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { modelTestReport, modelTestStore, runModelTest, stopModelTest, type TestRow } from './modelTest'
import { ReportBox } from './ReportBox'

const STATUS: Record<TestRow['status'], string> = {
  waiting: 'waiting',
  running: 'asking…',
  ok: 'ok',
  failed: 'failed',
  stopped: 'stopped',
}

function Row({ row }: { row: TestRow }) {
  return (
    <li className="py-2">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{row.label}</span>
        <span className={cn('shrink-0 text-xs font-semibold', row.status === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : row.status === 'failed' ? 'text-rose-600 dark:text-rose-400' : 'text-muted')}>
          {STATUS[row.status]}
          {row.ms !== undefined && ` · ${formatMs(row.ms)}`}
        </span>
      </div>
      {(row.score || row.error || row.answeredBy) && (
        <p className="text-xs text-muted">
          {row.score && `${row.score.found}/${row.score.total} words · ${row.score.pinyinRight}/${row.score.total} pinyin`}
          {row.answeredBy && row.label.startsWith('openrouter/free') && ` · picked ${row.answeredBy}`}
          {row.error && <span className="block break-words">{row.error}</span>}
        </p>
      )}
    </li>
  )
}

/** Free mode only: send the sample page to each free vision model and compare speed and accuracy. */
export function FreeModelTest() {
  const ai = useAiSettings()
  const apiKey = ai.free.apiKey.trim()
  const quota = useFreeQuota(ai.mode === 'free' ? apiKey : '')
  const test = useSyncExternalStore(modelTestStore.subscribe, modelTestStore.get)
  if (ai.mode !== 'free') return null
  if (!apiKey) return <p className="text-muted">Connect the free AI (Settings → AI for PDF import) to test the free models.</p>

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">
        Sends the app’s sample page to each free model that can read images, one at a time, and measures how long each takes and how many words it
        gets right. Uses up to {MAX_TEST_REQUESTS} of today’s free requests{quota ? ` (${quota.remaining} left)` : ''} and takes a few minutes; you
        can leave this screen meanwhile.
      </p>
      <div className="flex gap-2">
        {test.running ? (
          <Button size="sm" variant="secondary" onClick={stopModelTest}>
            Stop
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => void runModelTest(apiKey)} disabled={quota !== undefined && quota.remaining < MAX_TEST_REQUESTS}>
            {test.rows.length ? 'Test again' : 'Test the free models'}
          </Button>
        )}
      </div>
      {quota !== undefined && quota.remaining < MAX_TEST_REQUESTS && !test.running && (
        <p className="text-xs text-muted">Not enough free requests left today; try again tomorrow.</p>
      )}
      {test.note && <p className="text-sm">{test.note}</p>}
      {test.rows.length > 0 && (
        <>
          <ul className="divide-y divide-line">
            {test.rows.map((row, i) => (
              <Row key={i} row={row} />
            ))}
          </ul>
          {!test.running && <ReportBox text={modelTestReport(test)} />}
        </>
      )}
    </div>
  )
}
