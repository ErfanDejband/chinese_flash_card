import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { LeitnerConfig } from '@/domain/types'
import { LeitnerDemo } from '@/features/onboarding/LeitnerDemo'
import { useSettings } from '@/hooks/useDeck'
import { Icon } from '@/ui/icons'
import { PageHeader } from '@/ui/PageHeader'
import { HELP_TOPICS, matchesHelp, type HelpBlock, type HelpTopic } from './topics'

function Block({ block, leitner }: { block: HelpBlock; leitner?: LeitnerConfig }) {
  if (typeof block === 'string') return <p>{block}</p>
  if ('list' in block) {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {block.list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )
  }
  return leitner ? <LeitnerDemo config={leitner} /> : null
}

function TopicBody({ topic, leitner }: { topic: HelpTopic; leitner?: LeitnerConfig }) {
  return (
    <div className="flex flex-col gap-3 px-5 pb-5 text-sm leading-relaxed">
      {topic.blocks.map((block, i) => (
        <Block key={i} block={block} leitner={leitner} />
      ))}
      {topic.links && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 font-semibold text-accent">
          {topic.links.map((link) =>
            link.to ? (
              <Link key={link.label} to={link.to}>
                {link.label} →
              </Link>
            ) : (
              <a key={link.label} href={`${import.meta.env.BASE_URL}${link.page}`}>
                {link.label} →
              </a>
            ),
          )}
        </p>
      )}
    </div>
  )
}

/** `/help`: short topics on how to use the app; `?topic=<id>` opens one. */
export function HelpPage() {
  const [params] = useSearchParams()
  const linked = params.get('topic')
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(linked ? [linked] : []))
  const [query, setQuery] = useState('')
  const leitner = useSettings()?.leitner

  useEffect(() => {
    if (linked) document.getElementById(`help-${linked}`)?.scrollIntoView({ block: 'start' })
  }, [linked])

  const searching = query.trim() !== ''
  const topics = HELP_TOPICS.filter((t) => matchesHelp(t, query))

  function toggle(id: string, isOpen: boolean) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (isOpen) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <>
      <PageHeader title="Help" subtitle="How to use Mandarin Leitner" />

      <label className="relative mb-4 block">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help"
          className="h-12 w-full rounded-xl border border-line bg-surface pr-3 pl-10 outline-none focus:border-accent"
        />
      </label>

      {topics.length === 0 ? (
        <p className="py-8 text-center text-muted">Nothing found. Try another word.</p>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {topics.map((topic) => (
            <details
              key={topic.id}
              id={`help-${topic.id}`}
              open={searching || open.has(topic.id)}
              onToggle={(e) => !searching && toggle(topic.id, e.currentTarget.open)}
              className="group scroll-mt-20"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-semibold hover:bg-sunken [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">{topic.title}</span>
                <Icon name="chevron" className="size-5 shrink-0 text-muted transition group-open:rotate-90 motion-reduce:transition-none" />
              </summary>
              <TopicBody topic={topic} leitner={leitner} />
            </details>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        Something missing or unclear?{' '}
        <a className="underline" href="https://github.com/ErfanDejband/chinese_flash_card/issues/new" target="_blank" rel="noreferrer">
          Tell us on GitHub
        </a>
      </p>
    </>
  )
}
