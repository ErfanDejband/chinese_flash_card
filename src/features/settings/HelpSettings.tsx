import { ButtonLink } from '@/ui/Button'
import { Icon } from '@/ui/icons'

/** The way to the Help page. */
export function HelpSettings() {
  return (
    <div className="flex flex-col items-start gap-3 text-sm">
      <p className="text-muted">Short answers about the boxes, importing, AI, pictures, sync and more.</p>
      <ButtonLink to="/help" variant="secondary">
        <Icon name="help" /> Open help
      </ButtonLink>
    </div>
  )
}
