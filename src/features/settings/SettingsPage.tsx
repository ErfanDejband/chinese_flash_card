import type { ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useParams } from 'react-router'
import type { AppSettings } from '@/domain/types'
import { useIsDesktop } from '@/hooks/useBrowser'
import { useSettings } from '@/hooks/useDeck'
import { cn } from '@/ui/cn'
import { Icon } from '@/ui/icons'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
import { AiSettings } from './AiSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { AppInfoSettings } from './AppInfoSettings'
import { BackupSettings } from './BackupSettings'
import { findCategory, SECTION_TITLES, SETTINGS_CATEGORIES, type SettingsSectionId } from './categories'
import { DirectionSettings } from './DirectionSettings'
import { KnownWordsSettings } from './KnownWordsSettings'
import { LeitnerSettings } from './LeitnerSettings'
import { PictureSettings } from './PictureSettings'
import { Section } from './Section'
import { SupportSettings } from './SupportSettings'
import { SyncSettings } from './SyncSettings'
import { UsagePanel } from './UsagePanel'
import { VoiceSettings } from './VoiceSettings'

const SECTION_CONTENT: Record<SettingsSectionId, (settings: AppSettings) => ReactNode> = {
  direction: (s) => <DirectionSettings settings={s} />,
  leitner: (s) => <LeitnerSettings key={JSON.stringify([s.leitner, s.newPerDay])} settings={s} />,
  knownWords: () => <KnownWordsSettings />,
  appearance: () => <AppearanceSettings />,
  voice: (s) => <VoiceSettings settings={s} />,
  ai: () => <AiSettings />,
  pictures: () => <PictureSettings />,
  usage: () => <UsagePanel />,
  sync: () => <SyncSettings />,
  backup: () => <BackupSettings />,
  support: () => <SupportSettings />,
  app: () => <AppInfoSettings />,
}

/** `/settings/*`: on a laptop, the categories stay in a sidebar next to the open one. */
export function SettingsLayout() {
  return (
    <div className="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
      <aside className="sticky top-24 hidden self-start md:block">
        <p className="mb-3 px-3 text-xs font-bold tracking-wide text-muted uppercase">Settings</p>
        <nav className="flex flex-col gap-1" aria-label="Settings">
          {SETTINGS_CATEGORIES.map((c) => (
            <NavLink
              key={c.id}
              to={`/settings/${c.id}`}
              className={({ isActive }) =>
                cn('flex items-center gap-3 rounded-lg px-3 py-2 font-medium', isActive ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')
              }
            >
              <Icon name={c.icon} className="size-5 shrink-0" />
              {c.title}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}

/** `/settings`: the list of categories on a phone; a laptop opens the first one (the sidebar lists them). */
export function SettingsIndex() {
  const desktop = useIsDesktop()
  if (desktop) return <Navigate to="/settings/study" replace />
  return (
    <>
      <PageHeader title="Settings" />
      <nav aria-label="Settings" className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
        {SETTINGS_CATEGORIES.map((c) => (
          <Link key={c.id} to={`/settings/${c.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-sunken">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
              <Icon name={c.icon} className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{c.title}</span>
              <span className="block truncate text-sm text-muted">{c.description}</span>
            </span>
            <Icon name="chevron" className="size-5 shrink-0 text-muted" />
          </Link>
        ))}
      </nav>
    </>
  )
}

/** `/settings/:category`: that category's sections. */
export function SettingsCategoryPage() {
  const { category: id } = useParams()
  const category = findCategory(id)
  const settings = useSettings()
  const desktop = useIsDesktop()
  if (!category) return <Navigate to="/settings" replace />
  if (!settings) return <Loading />
  return (
    <>
      <PageHeader title={category.title} back={desktop ? undefined : '/settings'} />
      {category.sections.map((section) => (
        <Section key={section} title={SECTION_TITLES[section]}>
          {SECTION_CONTENT[section](settings)}
        </Section>
      ))}
    </>
  )
}
