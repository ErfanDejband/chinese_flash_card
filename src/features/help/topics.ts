/**
 * The Help page's topics, as plain data so they can be searched (and linked to: `/help?topic=<id>`).
 * Keep them true to what the app does when features change.
 */
export type HelpBlock = string | { list: string[] } | { demo: 'boxes' }

export interface HelpLink {
  label: string
  /** An app route. */
  to?: string
  /** A static page next to the app (about.html, privacy.html). */
  page?: string
}

export interface HelpTopic {
  id: string
  title: string
  /** Extra words people may search for. */
  keywords: string
  blocks: HelpBlock[]
  links?: HelpLink[]
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: 'boxes',
    title: 'How the boxes work',
    keywords: 'leitner spaced repetition interval schedule new cards',
    blocks: [
      'Every card sits in a box. New cards wait in 新, the new-card pool; a few are introduced each day (15 by default).',
      'Each box has its own wait: 1 day in Box 1, then 2, 4, 7 and 14 days. Knew it? The card moves up a box and comes back later (a new card you already know goes straight to Box 2). Forgot? It goes back to Box 1, and you see it again before the session ends.',
      'Only your first answer of the day moves a card, so trying a forgotten card again in the same session does not push it up.',
      { demo: 'boxes' },
      'The number of boxes, their waits, the new cards per day and what Forgot does (back to Box 1, or down one box) are in Settings → Study.',
    ],
    links: [{ label: 'Leitner settings', to: '/settings/study' }],
  },
  {
    id: 'routine',
    title: 'A daily routine (5 minutes)',
    keywords: 'review session start show answer knew forgot undo streak missed day',
    blocks: [
      'Open the app once a day and tap Start review. The number on Home is what is due today plus today’s new cards.',
      {
        list: [
          'Look at the front and answer in your head (out loud is even better).',
          'Tap Show answer.',
          'Be honest: Knew or Forgot. Forgotten cards come back at the end of the session.',
          'Tapped the wrong one? ↶ at the top undoes the last answer.',
        ],
      },
      'Missed a day? Nothing is lost: due cards wait for you. The streak counts the days in a row you reviewed.',
    ],
  },
  {
    id: 'adding',
    title: 'Adding cards yourself',
    keywords: 'new card add type characters pinyin meaning example notes edit delete',
    blocks: [
      'Tap + Add card on Home or in Settings → Your cards. Only the characters are needed; the app suggests the pinyin from its dictionary.',
      'Add a meaning, notes, an example sentence or a picture if you like. In the default direction the picture is the question, so cards with pictures work best.',
      'Tap any card in Settings → Your cards to edit or delete it. The app is made for Traditional characters with pinyin.',
    ],
    links: [{ label: 'Add a card', to: '/cards/new' }],
  },
  {
    id: 'snap',
    title: 'Snap: cards from a photo of things around you',
    keywords: 'camera photo object objects detect things room desk kitchen picture take snap word level everyday precise',
    blocks: [
      'Tap the camera button in the middle of the bar, take a photo (or choose one), and tap the things you want to learn. Dots show what the app found; a tap anywhere else adds a small box you can adjust.',
      'Objects are found on your phone. The first time, the app downloads its object finder once (about 18 MB, or 49 MB on phones that can use the graphics chip); after that it works offline. The photo stays on your phone: only the objects you chose, cut out into one small picture, go to your AI service to be named.',
      'For each object you get the everyday word first (鞋子 shoes) and sometimes a more precise one (球鞋 sneakers), each with a level from A1 to C2. My level picks one for you: beginners get the everyday word. Keeping both makes two cards, but very similar words learned on the same days can get mixed up, so adding the second one later can help.',
      'Cards from Snap use the cut-out as their picture and are tagged snap and with a group such as 衣物, so you can find them in Your cards.',
    ],
    links: [{ label: 'Snap', to: '/snap' }],
  },
  {
    id: 'import',
    title: 'Importing a PDF, photos or screenshots',
    keywords: 'ai pdf photo image screenshot textbook course book page vocabulary reading story crop flags duplicate simplified',
    blocks: [
      'Import → Choose a PDF or images, then pick the pages you want and what they hold:',
      {
        list: [
          'Vocabulary: word lists, vocabulary slides, pictures with labels.',
          'Reading: story pages. Each sentence is split into words, and the new words become cards with the sentence as their example.',
        ],
      },
      'The AI reads one page at a time and makes draft cards. Nothing is added until you check them: fix a field, adjust a picture’s crop, untick what you don’t want, then add them.',
      'Flags point at things worth a look: characters, pinyin or meanings the AI filled in, a reading that differs from the dictionary, Simplified characters, duplicates and unsure answers. Words already in your deck or in your known words start unticked.',
    ],
    links: [{ label: 'Import', to: '/import' }],
  },
  {
    id: 'word-lists',
    title: 'Importing a word list (Anki, Pleco, Quizlet, CSV)',
    keywords: 'anki pleco quizlet csv tsv txt excel spreadsheet google sheets export text file columns big5 move switch',
    blocks: [
      'Import → Import a word list reads the text files other apps export. No AI is needed, and nothing leaves your device. Choosing such a file under Import or Settings → Sync & backup → Restore from file opens it too.',
      {
        list: [
          'Anki: File → Export → Notes in Plain Text (.txt).',
          'Pleco: export your flashcards as a text file.',
          'Quizlet: open a set → Export, copy the text and save it as a .txt file.',
          'Excel, Numbers or Google Sheets: save as CSV or tab-separated text. UTF-8, UTF-16 and Big5 files all work.',
        ],
      },
      'The app guesses what each column holds (characters, pinyin, meaning, example, notes, tags); change any column with its menu. A preview shows the first cards and what needs a look.',
      'Options: skip words already in your deck or in your known words, convert Simplified characters to Traditional (only when you tick it), fill in missing pinyin from the dictionary, and a tag for the new cards. Pleco categories and Anki tags are kept as tags too.',
      'Settings → Sync & backup → Export word list (TSV) saves your cards as a tab-separated file that Anki and Pleco can import.',
    ],
    links: [
      { label: 'Import a word list', to: '/import/list' },
      { label: 'Export', to: '/settings/sync' },
    ],
  },
  {
    id: 'ai',
    title: 'Free AI or your own key',
    keywords: 'openrouter gemini claude openai groq api key free quota model sign in',
    blocks: [
      'Importing needs an AI that can read images. There are two ways, in Settings → AI & pictures:',
      {
        list: [
          'Free, no key: sign in with OpenRouter (Google or e-mail) and use its free models, about 50 pages a day.',
          'Your own API key: Gemini, Claude, OpenAI, OpenRouter, Groq or a local server. Usually faster and more accurate; the provider bills you.',
        ],
      },
      'A key stays on this device and is sent only to its own provider. It is never in backups or sync.',
    ],
    links: [{ label: 'AI settings', to: '/settings/ai' }],
  },
  {
    id: 'pictures',
    title: 'Pictures for cards',
    keywords: 'image picture emoji generate sheet crop',
    blocks: [
      'In the default direction (Picture → Chinese) the picture is the question. A card without one shows its English meaning instead.',
      'Add a picture in the card form, keep the one an import cropped from the page, or make many at once: Settings → Your cards → No picture → Add pictures. That uses an image AI (paid, one sheet of 4 to 9 pictures at a time) or free emoji.',
    ],
    links: [{ label: 'Cards without a picture', to: '/cards?pic=none' }],
  },
  {
    id: 'directions',
    title: 'Practice directions',
    keywords: 'mode direction listening sound audio speech voice tts hanzi meaning picture',
    blocks: [
      {
        list: [
          'Picture → Chinese (the default): see the picture or the meaning, recall the characters and pinyin.',
          'Chinese → meaning: see the characters, recall how they are read and what they mean.',
          'Sound → Chinese: hear the word, recall the characters and meaning. This needs a Mandarin text-to-speech voice on the device; ▶ plays it again.',
        ],
      },
      'Each direction keeps its own boxes, so the first time you switch, your cards start as new cards in that direction.',
    ],
    links: [{ label: 'Choose a direction', to: '/settings/study' }],
  },
  {
    id: 'known',
    title: 'Known words',
    keywords: 'known words skip particles names',
    blocks: [
      'Words you already know but don’t want cards for (我, 是, 的…). Imports untick them. Tap “I know this” on a draft card, or manage the list in Settings → Study → Known words.',
    ],
    links: [{ label: 'Known words', to: '/settings/study' }],
  },
  {
    id: 'progress',
    title: 'Progress and streaks',
    keywords: 'stats statistics streak calendar chart most forgotten',
    blocks: [
      'The Progress tab shows your streak, a calendar of the days you studied, the last 7 days, how your cards moved through the boxes, and the cards you forget most.',
      'Keep forgetting a card? Open it and add a note or a picture that helps.',
    ],
    links: [{ label: 'Progress', to: '/progress' }],
  },
  {
    id: 'sync',
    title: 'Sync between devices',
    keywords: 'google drive phone laptop devices cloud',
    blocks: [
      'Your cards live in this browser. To use them on your phone and your laptop, turn on sync in Settings → Sync & backup: it keeps a copy in your own Google Drive, in a hidden folder only this app can see.',
      'Pictures are not synced yet (save a backup to move them), and AI keys always stay on each device.',
    ],
    links: [{ label: 'Sync settings', to: '/settings/sync' }],
  },
  {
    id: 'backup',
    title: 'Backup and restore',
    keywords: 'backup restore export zip file move data safe',
    blocks: [
      'Settings → Sync & backup → Backup saves your cards, pictures and progress in one .zip file. Restoring merges it in: for each card, the newer version wins.',
      'A browser can clear a site’s data when space runs low, so keep a backup now and then, or turn on sync.',
    ],
    links: [{ label: 'Backup', to: '/settings/sync' }],
  },
  {
    id: 'install',
    title: 'Install on your phone',
    keywords: 'install home screen pwa offline android iphone',
    blocks: [
      'Installed, the app opens full screen from your home screen and works offline.',
      {
        list: [
          'Android (Chrome): menu ⋮ → Install app (or Add to Home screen).',
          'iPhone (Safari): Share → Add to Home Screen.',
          'Laptop (Chrome or Edge): the install icon at the end of the address bar.',
        ],
      },
    ],
    links: [{ label: 'Install from Settings', to: '/settings/about' }],
  },
  {
    id: 'keys',
    title: 'Keyboard shortcuts (laptop)',
    keywords: 'keyboard shortcut keys space arrow',
    blocks: [
      {
        list: ['Space: show the answer', '← or 1: Forgot · → or 2: Knew', 'U: undo the last answer', 'R: play the word again (Sound → Chinese)'],
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    keywords: 'privacy data tracking account',
    blocks: [
      'No account, no ads, no tracking. Your cards stay in this browser unless you turn on sync (your own Google Drive). Pages you import are sent only to the AI service you chose.',
    ],
    links: [
      { label: 'Privacy policy', page: 'privacy.html' },
      { label: 'About', page: 'about.html' },
    ],
  },
]

function topicText(topic: HelpTopic): string {
  const blocks = topic.blocks.map((b) => (typeof b === 'string' ? b : 'list' in b ? b.list.join(' ') : ''))
  return [topic.title, topic.keywords, ...blocks].join(' ').toLowerCase()
}

/** True when every word of the query appears in the topic. */
export function matchesHelp(topic: HelpTopic, query: string): boolean {
  const text = topicText(topic)
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word))
}
