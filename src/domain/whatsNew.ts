/**
 * "What's new" after an app update. Releases are identified by their date (`YYYY-MM-DD`), so
 * ISO dates compare as plain strings; `''` sorts before every release (nothing seen yet).
 */
export interface ReleaseLike {
  id: string
}

/** The releases newer than `lastSeen`, newest first, at most `max` (older ones stay in Settings). */
export function unseenReleases<R extends ReleaseLike>(releases: readonly R[], lastSeen: string, max = 3): R[] {
  return releases
    .filter((r) => r.id > lastSeen)
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .slice(0, Math.max(0, max))
}
