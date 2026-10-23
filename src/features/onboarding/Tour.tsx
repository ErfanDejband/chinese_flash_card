import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { updateOnboarding } from '@/lib/onboarding'
import { Button } from '@/ui/Button'

/** Each step points at the element carrying `data-tour="<target>"` (the visible one: the nav exists twice). */
const STEPS: { target: string; title: string; body: string }[] = [
  { target: 'today', title: 'Your daily review', body: 'Start here once a day. The number is what is due today plus today’s new cards.' },
  { target: 'nav-progress', title: 'Progress', body: 'Your streak, a calendar of the days you studied, and the cards you forget most.' },
  { target: 'nav-cards', title: 'Cards', body: 'Search, edit and add cards. The + Add card button is on Home too.' },
  { target: 'nav-import', title: 'Import', body: 'Turn a PDF, photos or screenshots of your textbook into cards. Free AI works without a key.' },
  { target: 'help', title: 'Help', body: 'Questions later? Short answers are behind this ?. Settings has the practice direction, boxes, sync and backup.' },
]

const PAD = 6
const GAP = 12
const MARGIN = 16

function findTarget(target: string): Element | undefined {
  return [...document.querySelectorAll(`[data-tour="${target}"]`)].find((el) => el.getClientRects().length > 0)
}

/** Spotlight tour of Home's main controls, once per device (Settings → Help & tips replays it). */
export function Tour() {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect>()
  const bubble = useRef<HTMLDivElement>(null)
  const last = step === STEPS.length - 1
  const finish = () => updateOnboarding({ tourDone: true })

  useLayoutEffect(() => {
    const update = () => setRect(findTarget(STEPS[step]!.target)?.getBoundingClientRect())
    findTarget(STEPS[step]!.target)?.scrollIntoView({ block: 'nearest' })
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [step])

  useEffect(() => {
    bubble.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') updateOnboarding({ tourDone: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  // The bubble goes below the target, or above it when the target sits in the lower half.
  const width = Math.min(320, window.innerWidth - 2 * MARGIN)
  const bubbleStyle: CSSProperties = { width }
  if (rect) {
    bubbleStyle.left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, MARGIN), window.innerWidth - width - MARGIN)
    if (rect.top + rect.height / 2 > window.innerHeight / 2) bubbleStyle.bottom = window.innerHeight - rect.top + PAD + GAP
    else bubbleStyle.top = rect.bottom + PAD + GAP
  } else {
    bubbleStyle.left = (window.innerWidth - width) / 2
    bubbleStyle.top = window.innerHeight / 3
  }
  const { title, body } = STEPS[step]!

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-2xl outline-2 outline-accent transition-all duration-200 motion-reduce:transition-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + 2 * PAD,
            height: rect.height + 2 * PAD,
            // The dimming is a huge shadow around the cut-out; the outline marks its edge.
            boxShadow: '0 0 0 100vmax rgb(0 0 0 / 0.65)',
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/65" />
      )}
      <div ref={bubble} tabIndex={-1} className="fixed rounded-2xl border border-line bg-surface p-4 shadow-xl outline-none" style={bubbleStyle}>
        <p className="text-xs text-muted tabular-nums">
          {step + 1} of {STEPS.length}
        </p>
        <h2 id="tour-title" className="font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm">{body}</p>
        <div className="mt-3 flex items-center gap-2">
          {!last && (
            <Button size="sm" variant="ghost" onClick={finish}>
              Skip
            </Button>
          )}
          <span className="flex-1" />
          {step > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button size="sm" onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
