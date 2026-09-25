# ADR 0002: Separate card content from Leitner state

**Status:** accepted (2026-09-25)

## Context

A card has content (characters, pinyin, meaning, image, notes) and learning progress (box, due date).
Future review modes (hanzi → pinyin, pinyin → hanzi, listening) need *independent* progress: knowing a
word from its picture does not mean you can read the characters.

## Decision

- `Card` (`src/domain/types.ts`) holds content only.
- `ReviewState` holds the Leitner state of one **(card, review mode)** pair, keyed `${cardId}:${mode}`.
  The MVP has one mode, `image_to_word`.
- `ReviewLogEntry` records every scheduling answer (from box, to box, result, time), append-only.
- `joinDeck` treats a card with no state in a mode as "not started", so adding a mode needs no migration:
  every card simply enters that mode's new-card pool.

## Consequences

- Adding a review mode = add the mode id, a prompt/answer UI, and a way to pick the mode for a session.
- Content edits and review updates touch different rows, which means fewer conflicts once sync exists.
- Stats and streaks come from the review log instead of being stored separately.
