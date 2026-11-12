# ADR 0013: Classes shared from the teacher's own Google Drive

Date: 2026-11-12 · Status: accepted

## Context
Teachers want to give a deck (a class with lessons, often 45–60+ cards each) to their students by link or QR code. Students
may know nothing about accounts or AI keys. They pick lessons, and should get new lessons and fixes later. The app has no
backend (ADR 0001); sync already uses each user's own Drive (ADR 0007).

Options considered:
- **Class files only.** The teacher sends a file. This needs no setup, but there's no QR code, and every update means a new file.
- **A server of our own** (for example a Cloudflare Worker). It would allow short codes and dashboards, but it means running
  a server, handling abuse and costs, and ending the app's backend-free design.
- **The teacher's Drive (chosen).** The class files live in the teacher's Drive, shared by link. Students read them with the
  app's public API key.

## Decision
- **Teacher side** (`src/classes/publish.ts`, `lib/classShare.ts`): the scope `drive.file` is asked for only when a teacher
  shares. The sign-in has `purpose: 'share'`, so it never switches sync on. Sync only uses a token that holds `drive.appdata`.
  - The app makes a folder "Mandarin Leitner · <deck>" in My Drive. Each file in it gets an `anyone / reader` permission.
  - The folder holds `class.json` (the manifest), one file per lesson (gzipped JSON of its cards), and one per picture.
  - Publishing sends only lessons whose hash changed and pictures not yet uploaded. It removes what's no longer used.
  - The manifest is rewritten in place, so the link (`#/join/<manifestId>`, a hash route) never changes.
  - If the folder is gone, publishing starts over once.
  - Hidden lessons and cards without a lesson are handled in `packLessons`.
- **Only card content is shared:** characters, pinyin, meaning, notes, example, tags and picture. Never progress.
- **Optional password:** PBKDF2-SHA-256 (310k iterations) → AES-256-GCM over the manifest body, the lessons and the
  pictures.
  - The title and teacher stay readable.
  - The derived key is kept on the teacher's deck row, so their devices can publish. A student's key is kept on their
    deck's `remote`.
- **Student side** (`src/classes/join.ts`, `apply.ts`): reads use the public key (`lib/classConfig.ts`). The key is limited
  to the Drive API and the app's addresses.
  - A joined class is a deck with the teacher's deck id and `remote = { manifestId, key?, lessons: {id: hash}, seen, stopped? }`.
  - Lessons and cards keep the teacher's ids and timestamps, so a student's devices write identical rows and sync doesn't
    ping-pong.
  - Joined cards are read-only, but a student can remove one for themselves. In lessons already taken, a removed card stays
    removed. A lesson picked now (or after rejoining) brings all its cards.
  - Cards the teacher removed, and lessons gone from the class, are removed.
  - New lessons are only pointed out (`seen`). The student chooses to add them.
  - `lib/classRunner.ts` checks each class at most every 6 hours, with one manifest request.
- **Class files** (.zip): the same parts, with no Drive, no password and no updates. Opening a newer file updates the class.

## Consequences
- Students need nothing. Teachers need a Google account that may share files by link. School Workspace accounts often
  can't; a 403 on the permission explains this and points to class files.
- Changes reach students only after "Publish changes", so teachers can prepare lessons before students see them.
- The public key can be copied, but it only reads files that are already public, and only from our addresses (others get
  403). The worst case is that our Drive API quota runs out.
- Old builds ignore the new deck fields; joined cards look like ordinary cards there.
- The privacy policy describes `drive.file` and link sharing (2026-11-12).
