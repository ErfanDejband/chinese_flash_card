import { useState } from 'react'
import { useNavigate } from 'react-router'
import { resetOnboarding, updateOnboarding } from '@/lib/onboarding'
import { Button, ButtonLink } from '@/ui/Button'
import { Icon } from '@/ui/icons'

/** The way to the Help page, and the first-run help again (tour, tips, getting-started list). */
export function HelpSettings() {
  const navigate = useNavigate()
  const [reset, setReset] = useState(false)
  return (
    <div className="flex flex-col items-start gap-3 text-sm">
      <p className="text-muted">Short answers about the boxes, importing, AI, pictures, sync and more.</p>
      <ButtonLink to="/help" variant="secondary">
        <Icon name="help" /> Open help
      </ButtonLink>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            updateOnboarding({ tourDone: false })
            navigate('/')
          }}
        >
          Replay the tour
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            resetOnboarding()
            setReset(true)
          }}
        >
          Show tips again
        </Button>
      </div>
      {reset && <p className="text-muted">Done: the tour, the tips and the getting-started list will show again.</p>}
    </div>
  )
}
