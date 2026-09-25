import { ButtonLink } from '@/ui/Button'
import { Icon } from '@/ui/icons'
import { PageHeader } from '@/ui/PageHeader'

/** Placeholder until the PDF pipeline (src/import) is built against real sample PDFs. */
export function ImportPage() {
  return (
    <>
      <PageHeader title="Import from PDF" />
      <div className="rounded-3xl border border-dashed border-line bg-surface p-6 text-center">
        <Icon name="import" className="mx-auto mb-3 size-10 text-muted" />
        <h2 className="mb-2 text-lg font-semibold">Coming next</h2>
        <p className="mx-auto mb-6 max-w-sm text-sm text-muted">
          PDF import finds vocabulary (characters, pinyin, image, meaning) in your course PDFs and lets you review every
          card before it is added. It will be tuned on your sample PDFs.
        </p>
        <ButtonLink to="/cards/new" variant="secondary">
          <Icon name="plus" /> Add a card manually
        </ButtonLink>
      </div>
    </>
  )
}
