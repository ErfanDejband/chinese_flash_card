import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { deleteCard, getCard } from '@/data/repositories/cards'
import { getReviewState } from '@/data/repositories/review'
import { getSettings } from '@/data/repositories/settings'
import type { Card, ReviewState } from '@/domain/types'
import { useToday } from '@/hooks/useToday'
import { boxLabel } from '@/ui/boxTones'
import { Button } from '@/ui/Button'
import { plural, relativeDay, shortDateTime } from '@/ui/format'
import { Hanzi } from '@/ui/Hanzi'
import { Icon } from '@/ui/icons'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
import { REVIEW_MODE_INFO } from '@/ui/reviewModes'
import { useSettings } from '@/hooks/useDeck'
import { CardForm } from './CardForm'

function Progress({ card, state }: { card: Card; state?: ReviewState }) {
  const today = useToday()
  const settings = useSettings()
  const source =
    card.source.type === 'pdf'
      ? `Imported from ${card.source.fileName}, page ${card.source.page}`
      : card.source.type === 'image'
        ? `Imported from ${card.source.fileName}`
        : 'Added manually'
  return (
    <div className="mb-6 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
      {settings && <p className="mb-1 text-xs font-semibold tracking-wide uppercase">{REVIEW_MODE_INFO[settings.reviewMode].label}</p>}
      {state && state.box > 0 ? (
        <p>
          <span className="font-semibold text-ink">{boxLabel(state.box)}</span>
          {state.dueOn && <> · next review {state.dueOn <= today ? 'today' : relativeDay(state.dueOn, today)}</>} · reviewed{' '}
          {plural(state.reviewCount, 'time')}
          {state.lapseCount > 0 && <> · forgotten {plural(state.lapseCount, 'time')}</>}
        </p>
      ) : (
        <p>
          <span className="font-semibold text-ink">Not started</span> · waiting in the new-card pool
        </p>
      )}
      <p className="mt-1">
        {source} on {shortDateTime(card.createdAt)}
      </p>
    </div>
  )
}

export function CardEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [formKey, setFormKey] = useState(0)
  const [flash, setFlash] = useState<string>()

  // undefined = loading, null = not found
  const card = useLiveQuery(async () => (id ? ((await getCard(id)) ?? null) : null), [id])
  // Progress in the practice direction currently chosen in Settings.
  const state = useLiveQuery(async () => (id ? getReviewState(id, (await getSettings()).reviewMode) : undefined), [id])

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/cards', { replace: true }))

  if (id && card === undefined) return <Loading />
  if (id && card === null) {
    return (
      <>
        <PageHeader title="Card not found" back="/cards" />
        <p className="text-muted">It may have been deleted.</p>
      </>
    )
  }

  const existing = card ?? undefined

  async function remove() {
    if (!existing || !confirm(`Delete “${existing.hanzi}”? Its review progress is removed too.`)) return
    await deleteCard(existing.id)
    goBack()
  }

  return (
    <>
      <PageHeader
        title={existing ? <Hanzi>{existing.hanzi}</Hanzi> : 'New card'}
        back="/cards"
        actions={
          existing && (
            <Button variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => void remove()} aria-label="Delete card">
              <Icon name="trash" className="size-5" />
            </Button>
          )
        }
      />
      {existing && <Progress card={existing} state={state} />}
      {flash && (
        <p className="mb-4 flex animate-reveal items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <Icon name="check" className="size-5" /> {flash}
        </p>
      )}
      <CardForm
        key={`${existing?.id ?? 'new'}-${formKey}`}
        card={existing}
        onSaved={(saved, addAnother) => {
          if (addAnother) {
            setFlash(`Saved ${saved.hanzi}. Add the next one.`)
            setFormKey((k) => k + 1)
            window.scrollTo({ top: 0 })
          } else {
            goBack()
          }
        }}
      />
    </>
  )
}
