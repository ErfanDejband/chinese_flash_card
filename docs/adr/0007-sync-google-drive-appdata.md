# ADR 0007: Sync between devices via each user's Google Drive app folder

**Status:** accepted (2026-10-10). Step 1 syncs cards, progress, review history, import records and settings; images follow in step 2.

## Context

Every device keeps its own IndexedDB ([ADR 0001](0001-local-first-storage.md)), so cards and progress moved between a phone and a
laptop only by hand, with the backup zip. The goals:
- automatic sync;
- free;
- no secret to leak;
- usable later by general users, not only by the developer.

The app is a static PWA on GitHub Pages.

## Options considered

- **Supabase** (Postgres, auth, storage):
  - smooth (long-lived sessions);
  - the developer would hold everyone's data and must get Row Level Security right;
  - free projects pause after a week of inactivity, and the quota is shared by all users.
- **Dexie Cloud:** the least code, but the free tier is 3 users / 100 MB, then paid per user.
- **Firebase:** generous for data, but file storage needs a billing account since 2026.
- **Google Drive `appDataFolder`.** Chosen:
  - each user's data lives in a hidden folder of *their own* Drive that only this app can open (scope `drive.appdata`, which
    Google classes as non-sensitive);
  - no server, no database to secure, no shared quota, no secret;
  - the app's Google Cloud project only provides the public OAuth client ID.

## Decision

- **Sign-in:**
  - OAuth 2.0 for client-side web apps (`response_type=token`, full-page redirect to the app root; scopes `drive.appdata email`;
    a random `state` in localStorage; no client secret);
  - `main.tsx` reads `#access_token…&state…` before rendering;
  - the token (~1 hour) is kept in localStorage.
  - There is no refresh token without a server, so an expired token means another trip to Google. By default this is **one tap**
    ("Tap to sync"). Optionally it's **automatic** (`prompt=none` hop) at app start or on return to the foreground, but never
    during a review or a running import, and at most once per page load if Google needs the user.
- **Drive layout:** gzipped canonical JSON:
  - `cards`, `states`, `imports` (not drafts), `settings` (without the speech voice), `tombstones`;
  - `log-YYYY-MM` shards by UTC month;
  - `manifest` (format/version; a newer version is refused).
- **Merge** (`domain/sync/merge.ts`):
  - last-write-wins per row by `updatedAt`, with a deterministic tie-break;
  - the review log is a union minus tombstones; undo writes a tombstone (Dexie v3 table `syncTombstones`).
  - The merge is commutative and idempotent, so concurrent syncs only delay changes, never lose them.
- **Sync run** (`sync/runSync.ts`):
  1. list the files;
  2. skip files unchanged on both sides (Drive `version` plus a content hash);
  3. otherwise download, merge, write locally in one transaction, and upload if the merged file differs.
- **First sync on a device** when Drive already has data and the device has cards: the user chooses **Combine both** or **Use the
  Drive copy** (replace this device's synced data).
- **Never synced:** AI keys and settings, AI usage, the speech voice, import work tables, and (until step 2) images.

## Consequences

- No cost, no server, nothing of the users' held by the developer. Users can delete the Drive copy in Drive → Settings → Manage apps.
- Sync isn't instant: it runs on open, after a review, on return to the app, and every 5 minutes, and an expired sign-in needs a
  tap or an automatic hop.
- A Google account is required to sync; the app itself still works fully offline without one.
- While the Google project is in "testing", only its listed test users can sign in. For general users, the project must be
  published; Google may ask for a home page and a privacy policy.
