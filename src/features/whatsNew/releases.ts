/** One "What's new" note: shown once after the update that brings it, and kept in Settings → About & support. */
export interface Release {
  /**
   * The release date, `YYYY-MM-DD`, with `.2`, `.3`… for a later release on the same day: newer
   * releases have larger ids (a device remembers the newest id it has seen).
   */
  id: string
  title?: string
  items: {
    text: string
    /** In-app route for a "Show me" link in the note. */
    to?: string
  }[]
}

/**
 * Newest first. Add an entry when a user-visible change ships: plain words, what the learner can
 * do now, a link where it helps. Devices that update show the entries they haven't seen (lib/whatsNew).
 */
export const RELEASES: readonly Release[] = [
  {
    id: '2026-10-29.2',
    title: 'Snap: words for things around you',
    items: [
      {
        text: 'Take a photo of things around you, tap the ones you want, and get their words as cards: the everyday word or a more precise one, for your level.',
        to: '/snap',
      },
      { text: 'Your cards are now in Settings, at the top.', to: '/settings' },
    ],
  },
  {
    id: '2026-10-29',
    title: 'Word lists and a clearer import',
    items: [
      {
        text: 'Import word lists from Anki, Pleco, Quizlet or any CSV/TSV file, and export your deck as a TSV file.',
        to: '/import/list',
      },
      { text: 'Importing pages now shows each step: the AI thinking, and the words as they arrive.', to: '/import' },
      { text: 'After each update, this note shows what changed. All updates are in Settings → About.', to: '/settings/about' },
    ],
  },
  {
    id: '2026-10-23',
    title: 'A friendlier start',
    items: [
      { text: 'New learners get a welcome screen with a box demo, a sample deck to try, short tips and a quick tour.' },
      { text: 'Help: short answers about the boxes, importing, sync and more, behind the ? on Home.' },
      { text: 'Try an import with a sample page, no AI needed.' },
      { text: 'Free AI: “Test the free models” in Settings → AI & pictures shows which free models are quick and accurate.' },
    ],
  },
  {
    id: '2026-10-22',
    title: 'Settings in pages',
    items: [
      { text: 'Settings are grouped into five pages: Study, Display & sound, AI & pictures, Sync & backup, About & support.' },
      { text: 'A small heart on Home if you’d like to support the app.' },
    ],
  },
  {
    id: '2026-10-20',
    title: 'Listening and dark mode',
    items: [
      { text: 'A third practice direction, Sound → Chinese: hear the word, then recall it. Each direction keeps its own boxes.' },
      { text: 'Light or dark: switch on Home, or follow the system in Settings → Display & sound.' },
    ],
  },
  {
    id: '2026-10-11',
    title: 'Reading pages and pictures',
    items: [
      { text: 'Import pages of a story book: the app picks the words you don’t know and keeps each sentence as an example.' },
      { text: 'Known words: list the words you already know, and imports leave them unticked.' },
      { text: 'Pictures for cards: AI-drawn pictures or emoji, after an import or from Cards → No picture.' },
    ],
  },
]

/** The newest release (start-up marks it seen on a fresh device). */
export const LATEST_RELEASE_ID = RELEASES[0]?.id ?? ''

/** The calendar day of a release id (`2026-10-29.2` → `2026-10-29`). */
export const releaseDay = (id: string) => id.slice(0, 10)
