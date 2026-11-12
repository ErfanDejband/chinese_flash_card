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
    id: '2026-11-12.6',
    title: 'A ready-made class',
    items: [
      {
        text: 'New: “Beginner Mandarin Course (Term II)”, 6 lessons and about 320 words, ready to join. Decks → Join a class, pick the lessons you want.',
        to: '/join',
      },
    ],
  },
  {
    id: '2026-11-12.5',
    title: 'Your own copy of a class',
    items: [
      {
        text: 'A class you joined can become your own deck: open it and tap Make it my own deck. Your progress stays, and you can edit the cards or share them as your own class.',
        to: '/decks',
      },
    ],
  },
  {
    id: '2026-11-12.4',
    title: 'Ending a class',
    items: [
      {
        text: 'Deleting a shared class now stops sharing it in the same step. Students keep their cards and see a short note that it ended.',
      },
    ],
  },
  {
    id: '2026-11-12.3',
    title: 'Classes',
    items: [
      {
        text: 'Teachers: open a deck and tap Share as a class. You get a link and a QR code for your students, an optional password, and Publish changes when you add lessons or fix cards.',
        to: '/decks',
      },
      {
        text: 'Students: open your teacher’s link or scan their QR code, pick the lessons, and the cards arrive with their pictures. Your teacher’s updates and new lessons follow. No account needed.',
        to: '/join',
      },
      {
        text: 'No Google? Save a deck as a class file and send it; it opens under Decks → Join a class.',
      },
    ],
  },
  {
    id: '2026-11-12.2',
    title: 'Pictures from your spreadsheet',
    items: [
      {
        text: 'Word lists can bring their pictures: pictures inserted in an Excel column (in the cell or over it) become the card pictures. Or name the image files in a column (apple.jpg) and choose them together with the sheet.',
        to: '/import/list',
      },
    ],
  },
  {
    id: '2026-11-12',
    title: 'Decks and lessons',
    items: [
      {
        text: 'Import is now Decks: group your cards into decks (a textbook, a class) and lessons. Cards you already have can be moved in from Your cards.',
        to: '/decks',
      },
      {
        text: 'Review just one deck or a few lessons: pick them with the chips above Start review. New cards still count against one daily limit.',
      },
      {
        text: 'Add a whole lesson at once from an Excel file, or paste rows from any spreadsheet. A Lesson column makes the lessons for you; templates are on that screen.',
        to: '/import/list?paste=1',
      },
      {
        text: 'Grammar points: tick Grammar point on a card (or write grammar in a Type column) and it is asked by its meaning, never by a picture.',
      },
    ],
  },
  {
    id: '2026-11-04.2',
    title: 'Zhuyin in ㄅㄆㄇㄈ order',
    items: [
      {
        text: 'The zhuyin symbols now follow the ㄅㄆㄇㄈ order, with consonants, medials and vowels apart, and the chart has the tone marks. If you added the symbol cards already, tap Update there for better hints and example words.',
        to: '/settings/study',
      },
      {
        text: 'New cards from the AI use Taiwan’s readings, like 垃圾 lèsè and 星期 xīngqí, unless the page prints its own.',
      },
      {
        text: 'Known words fold away, so Settings stays short. You can still add or find a word right there.',
        to: '/settings/study',
      },
    ],
  },
  {
    id: '2026-11-04',
    title: 'Zhuyin',
    items: [
      {
        text: 'Cards can now show zhuyin, or pinyin and zhuyin together, on all your words. Choose in Settings → Display & sound.',
        to: '/settings/display',
      },
      {
        text: 'Learn the 37 zhuyin symbols with cards: ㄅ on the front, its pinyin, a hint and its sound on the back. A chart lets you hear every sound.',
        to: '/settings/study',
      },
    ],
  },
  {
    id: '2026-10-30.2',
    title: 'Sync you can follow',
    items: [
      {
        text: 'Pictures now sync a few at a time, with a bar showing how many are done. A connection that stalls no longer leaves sync stuck.',
        to: '/settings/sync',
      },
      {
        text: 'Connecting a device whose cards differ from your Drive now offers a third choice, “Use this device”: Drive and your other devices take its cards.',
        to: '/settings/sync',
      },
    ],
  },
  {
    id: '2026-10-30',
    title: 'Pictures on all your devices',
    items: [
      {
        text: 'Card pictures now sync between your devices, a batch at a time. Until a picture arrives, its card shows a small picture icon and asks with the meaning.',
        to: '/settings/sync',
      },
      { text: 'Snap pictures are bigger: the object in its place, in focus, with the surroundings softly faded.', to: '/snap' },
    ],
  },
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
