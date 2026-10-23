import { useState } from 'react'
import { Button } from '@/ui/Button'

/** A plain-text report to read here, with "Copy report" for pasting it into a message. */
export function ReportBox({ text }: { text: string }) {
  const [copied, setCopied] = useState<'yes' | 'no'>()

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied('yes')
    } catch {
      setCopied('no')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <pre className="max-h-80 overflow-auto rounded-xl bg-sunken p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text">{text}</pre>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" onClick={() => void copy()}>
          Copy report
        </Button>
        {copied === 'yes' && <span className="text-xs text-muted">Copied ✓</span>}
        {copied === 'no' && <span className="text-xs text-muted">Couldn’t copy: select the text above instead.</span>}
      </div>
    </div>
  )
}
