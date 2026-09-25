import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from './icons'

export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: string; actions?: ReactNode }) {
  return (
    <header className="mb-4 flex items-center gap-2">
      {back && (
        <Link to={back} className="-ml-2 grid size-10 place-items-center rounded-full text-muted hover:bg-sunken" aria-label="Back">
          <Icon name="back" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  )
}
