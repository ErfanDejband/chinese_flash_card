# Mandarin Leitner

A personal, mobile-first PWA for learning Mandarin vocabulary (Traditional characters + pinyin) with the
[Leitner box system](https://en.wikipedia.org/wiki/Leitner_system). Offline-first: your cards live in your
browser (IndexedDB). Nothing leaves the device unless you use an optional feature: AI import and AI pictures
send what they need to the AI services you configure, and sync stores a copy in your own Google Drive.

## Features

- **First-run help**: a welcome screen with a box shelf you can play with, three ways to start (import a textbook, type
  your own words, or try 10 sample words with pictures), and a searchable Help page (the **?** on Home).
  See [ADR 0010](docs/adr/0010-first-run-help.md)
- **Cards**: characters, pinyin (type `lao3shi1` → `lǎoshī`, or auto-fill from the characters), meaning, image, notes
- **Review**: three practice directions, each with its own boxes (Settings → Practice direction):
  picture → Chinese (fallback: meaning → Chinese), Chinese → pinyin + meaning + picture, or sound → Chinese
  (the device speaks the word; tap ▶ or press R to hear it again). Knew / Forgot, undo, keyboard shortcuts, text-to-speech
- **Light or dark**: follows the system, or pick Light / Dark (Settings → Appearance, or the sun/moon button on Home)
- **Leitner boxes**: configurable boxes and intervals, daily new-card limit, visual box shelf, per-box review
- **Progress tab**: start today's review (or see what's next), daily streak (also on Home), an 18-week activity calendar,
  the last 7 days vs the week before, cards per box week by week, and your most-forgotten cards — all derived from the
  local review log
- **Sync between devices** (Settings → Sync): cards, progress, review history, known words and settings sync through a hidden folder
  in your own Google Drive — no server, nothing stored anywhere else. Pictures follow in a later update. See
  [ADR 0007](docs/adr/0007-sync-google-drive-appdata.md)
- **Backup**: zip export / import (merge or replace)
- **PWA**: installable on Android, works offline
- **AI import from PDFs, photos or screenshots** (several images at once; rotate sideways pages; long screenshots
  are split automatically): pick pages → a vision model finds the vocabulary (and infers characters shown only as
  pinyin + picture) → review, edit and re-crop every card → add them in document order.
  See [ADR 0005](docs/adr/0005-ai-pdf-extraction.md)
- **Reading pages** (e.g. kids' books with zhuyin): choose *Reading page* when importing and the AI splits every sentence
  into words with their pinyin in context. Tap the words you don't know; words you already have, names and particles
  start switched off. Each card keeps its sentence as an example. A **known-words list** (Settings → Known words, or
  "I know this" while reviewing) keeps words you know out of later imports.
  See [ADR 0008](docs/adr/0008-reading-pages-and-known-words.md)
- **Pictures for cards without one** (after an import, or Cards → *No picture*): an AI image model draws several pictures on one
  sheet, which the app cuts apart. That's about ¼–⅑ of the price of single pictures. Choose a style (flat icon, sticker, textbook
  sketch, storybook, photo) and see an estimate first, then keep, adjust or redraw each picture before saving. Works with OpenRouter
  (with credit), OpenAI or Gemini keys (Settings → Pictures for cards). Free option: emoji.
  See [ADR 0009](docs/adr/0009-pictures-for-cards.md)

## Support

Mandarin Leitner is free, with no ads and no tracking. If it helps you, you can
[buy me a coffee on Ko-fi](https://ko-fi.com/mandarinleitner), star the repo, share the app, or report bugs and ideas in
[Issues](https://github.com/ErfanDejband/chinese_flash_card/issues). The same links are in Settings → *Support this app*.

## Development

Requires Node 24.

```sh
npm install
npm run dev          # http://localhost:5173
npm run dev -- --host  # also reachable from your phone on the same Wi-Fi
npm test             # unit + data-layer tests (Vitest, fake-indexeddb)
npm run lint         # includes architecture boundary rules
npm run build        # type-check + production build into dist/
```

Testing on a phone over the LAN uses plain http, so the service worker (offline/install) is not active
there; everything else works. Use the deployed HTTPS site to test installation.

## PDF import setup

**Easiest: free, no key.** In **Settings → AI for PDF import**, keep **Free — no key** and tap **Connect OpenRouter**
(or **Connect free AI** on the Import screen). Sign in at OpenRouter with Google or e-mail (no card); the app gets
your own OpenRouter key automatically and uses its free models (`openrouter/free`). The free tier covers about 50 pages
a day; the app shows how many are left. See [ADR 0006](docs/adr/0006-free-ai-via-openrouter-oauth.md).

**Or use your own API key** (**My own API key**):

1. Get an API key: a free Google Gemini key at <https://aistudio.google.com/apikey>, a Claude API key from the
   Claude Console (paid; separate from Claude.ai / Claude Code subscriptions), or an OpenRouter / Groq / OpenAI key,
   or use a local LM Studio / Ollama server.
2. In the app: **Settings → AI for PDF import**, paste the key. The app recognises the service from the key's format,
   loads the models that can read images and preselects a recommended one (Gemini: newest Flash; Claude: Opus 5).
3. **Import → Choose a PDF or images**, select (and rotate) the pages, **Extract**, review, **Add cards**.

The key is stored only in this browser (never in backups). Free tiers have per-minute/day limits: the importer
waits and retries on rate limits, and an interrupted import can be continued later.
**Settings → AI usage** shows the tokens used by the last import and in total on this device, with the cost where it
is known (reported by OpenRouter, or estimated for Claude from list prices).

Sample course PDFs for development go in `pdf_template/` (gitignored: copyrighted material).

## Deployment

`.github/workflows/deploy.yml` tests, builds, and deploys to GitHub Pages on every push to `main`
(`BASE_PATH=/<repo>/`). One-time setup: repository **Settings → Pages → Source: GitHub Actions**.
GitHub Pages on a free plan requires a public repository; the app contains no personal data (that stays in
your browser) and course PDFs are gitignored.

## Architecture

```
src/
  domain/    Pure TypeScript: types, Leitner scheduler, session planning/reducer, pinyin, search.
             No React, no persistence (enforced by ESLint).
  data/      Dexie schema, repositories (cards, review, media, settings), backup/restore.
  import/    PDF → AI → draft cards pipeline (UI-free): pdf.js rendering, provider adapters, prompt,
             validation/post-processing, extraction runner.
  features/  Screens: dashboard, review, boxes, cards, import, settings.
  ui/        Shared presentational components.
  hooks/     React hooks over data and browser APIs.
  lib/       Browser helpers: image resize, speech, install prompt, storage.
  app/       Router, layout, PWA update prompt.
```

Key decisions are recorded in [docs/adr](docs/adr):

1. [Local-first storage, sync later](docs/adr/0001-local-first-storage.md)
2. [Card content separate from Leitner state (per review mode)](docs/adr/0002-card-content-vs-review-state.md)
3. [Two-stage, pluggable PDF extraction](docs/adr/0003-pdf-extraction-pipeline.md) (superseded by 0005)
4. [Scheduling rules](docs/adr/0004-scheduling-rules.md)
5. [AI-assisted PDF extraction with your own API key](docs/adr/0005-ai-pdf-extraction.md)
6. [Free AI import via "Sign in with OpenRouter"](docs/adr/0006-free-ai-via-openrouter-oauth.md)
7. [Sync via each user's Google Drive app folder](docs/adr/0007-sync-google-drive-appdata.md)
8. [Reading pages and the known-words list](docs/adr/0008-reading-pages-and-known-words.md)
9. [Pictures for cards (sheets, cut apart)](docs/adr/0009-pictures-for-cards.md)

## Roadmap

1. Sync pictures too (step 2 of Drive sync), recorded audio, animated/3D boxes
2. More review modes (hanzi → pinyin, listening), tags/decks UI
3. AI extras: example sentences and exercises for existing cards
