# Mandarin Leitner

A personal, mobile-first PWA for learning Mandarin vocabulary (Traditional characters + pinyin) with the
[Leitner box system](https://en.wikipedia.org/wiki/Leitner_system). Offline-first: your cards live in your
browser (IndexedDB); nothing is sent to a server.

## Features (MVP)

- **Cards**: characters, pinyin (type `lao3shi1` → `lǎoshī`, or auto-fill from the characters), meaning, image, notes
- **Review**: image → word (fallback: meaning → word), Knew / Forgot, undo, keyboard shortcuts, text-to-speech
- **Leitner boxes**: configurable boxes and intervals, daily new-card limit, visual box shelf, per-box review
- **Backup**: zip export / import (merge or replace) — also how to move a deck between devices for now
- **PWA**: installable on Android, works offline
- **PDF import**: *next* — see [ADR 0003](docs/adr/0003-pdf-extraction-pipeline.md)

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
  import/    PDF extraction pipeline (UI-free; coming next).
  features/  Screens: dashboard, review, boxes, cards, import, settings.
  ui/        Shared presentational components.
  hooks/     React hooks over data and browser APIs.
  lib/       Browser helpers: image resize, speech, install prompt, storage.
  app/       Router, layout, PWA update prompt.
```

Key decisions are recorded in [docs/adr](docs/adr):

1. [Local-first storage, sync later](docs/adr/0001-local-first-storage.md)
2. [Card content separate from Leitner state (per review mode)](docs/adr/0002-card-content-vs-review-state.md)
3. [Two-stage, pluggable PDF extraction](docs/adr/0003-pdf-extraction-pipeline.md)
4. [Scheduling rules](docs/adr/0004-scheduling-rules.md)

## Roadmap

1. PDF import (layout reader → rule-based extractor + eval harness → Import Review screen)
2. Cloud sync (Supabase), recorded audio, animated/3D boxes
3. More review modes (hanzi → pinyin, listening), stats & streaks, tags/decks UI, AI-assisted extraction
