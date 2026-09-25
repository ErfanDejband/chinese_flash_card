export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-40 place-items-center text-muted" role="status">
      <div className="flex items-center gap-3">
        <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
        {label}
      </div>
    </div>
  )
}
