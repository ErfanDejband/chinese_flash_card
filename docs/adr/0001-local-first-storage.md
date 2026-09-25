# ADR 0001: Local-first storage in IndexedDB, sync later

**Status:** accepted (2026-09-25)

## Context

Personal app, used mostly on an Android phone, also on a desktop. Requirements: zero cost, works offline
(reviewing on the go), vocabulary must not be lost, eventually the same deck on several devices.

## Decision

- All data lives in the browser's IndexedDB, accessed through Dexie (`src/data/db.ts`).
- Images are stored as Blobs next to the cards (`media` table), downscaled to ≤ 800 px WebP.
- The app asks for persistent storage (`navigator.storage.persist()`); installed PWAs are normally granted it.
- Backup/restore as a zip (`src/data/backup`) is part of the MVP. It is also the way to move data between
  devices until sync exists, so restore supports **merge** (last-write-wins per row) as well as **replace**.
- The schema is sync-ready from day one: UUID ids, `updatedAt` on mutable rows, soft deletes (`deletedAt`),
  and an append-only review log.

## Consequences

- No backend, no accounts, no hosting cost beyond static files; fully offline.
- Data is per browser: until sync lands, moving between devices is export → import (merge).
- Clearing site data deletes everything, hence persistent storage + backups.
- Cloud sync (planned: Supabase Postgres + Storage; Dexie Cloud is an alternative) can push/pull rows by `updatedAt`
  without a schema redesign. Review-log rows are immutable, so they merge by union.
