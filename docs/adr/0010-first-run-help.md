# ADR 0010: First-run help

**Status:** accepted (2026-10-23).

## Context

The app is ready for people other than its author, but a newcomer saw only one sentence and two buttons on an empty
Home. Nothing explained the boxes, the daily routine, Show answer → Knew/Forgot, the practice directions, free AI vs
an own key, pictures, sync or reading pages.

What the research says:
- NN/g tested slide-deck tutorials on 70 users: no better task success or speed, and lower ease ratings in simple apps.
  They recommend contextual, interactive help.
- Duolingo lets people try a lesson before asking for anything.
- Anki explains spaced repetition just before the first study session.
- Guides recommend blending 2–4 short, skippable patterns and treating empty screens as onboarding.

## Options considered

The user compared 13 options with mockups (`plans/13-first-run-help.md`).
- **Rejected:** a welcome carousel (the NN/g result), and week-1 "quests" that reveal features over days.
- **Not now:** a tutorial played as a flashcard session about the app.

## Decision

**Step 1: first launch and reference**
- **Welcome** (Home while the deck is empty) holds three things:
  - the interactive box shelf;
  - "How do you want to start?": textbook/PDF → Import, type words → Add card, just try → sample deck;
  - practice-direction chips.
- **Box shelf demo** (`features/onboarding/LeitnerDemo`):
  - reuses `BoxesView` (`linked={false}`, `highlight`, `compact`);
  - moves one card with `domain/leitner/demo.ts`, which applies the real scheduler to the learner's own settings, so the
    demo can never disagree with the app.
- **Sample deck:** 10 Traditional words with emoji pictures (`domain/sampleDeck.ts`).
  - They are ordinary cards tagged `sample`, not a separate deck: the review, sync and backup need no special case.
  - Home offers to remove them (soft delete) or keep them (the tag is dropped).
  - A test checks every word against the pinyin dictionary and the Simplified detector. That test found 吃 wrongly
    flagged as Simplified (OpenCC maps it to 喫); it is now in `DUAL_USE`.
- **Help page** (`/help`):
  - topics are plain data (`features/help/topics.ts`), so they can be searched and linked to (`?topic=<id>`);
  - reached from the "?" on Home, the Welcome footer and Settings → About & support → Help & tips.
- **Empty screens:** Cards, an empty box and Progress each say what fills them and link to the next step or to Help.

**Step 2: guidance while using the app**
- **Just-in-time tips** (`features/onboarding/tips.ts`, `Tip`):
  - seven moments: the first card, the first reveal, the first finished session, the page picker, the import drafts,
    Progress and pictures;
  - a tip counts as seen as soon as it appears (✕ only hides it sooner), so it never nags;
  - each teaches one Chinese word with "+ add";
  - review tips have no "More" link, because leaving would end the session.
- **Getting-started checklist** (`domain/onboarding.ts`, `Checklist`) on Home:
  - five of your own words (sample cards don't count), the first review, a practice direction, installing, and sync or a
    backup;
  - it ticks itself and disappears once done or closed.
- **Spotlight tour** (`Tour`):
  - five steps over `data-tour` targets: the today card, Progress, Cards, Import, and the "?";
  - the visible copy of each nav item is used, so it works on the phone's bottom bar and the laptop's top bar;
  - the dimming is a large `box-shadow` around the cut-out, with an `outline` for its edge;
  - Esc or Skip ends it, and it runs once, before the checklist appears.
- **Import demo** (`import/demo/`):
  - a "Lesson 1" page drawn on a canvas and a `VisionProvider` that returns a canned reply built from the same layout, so
    the crops are right;
  - two deliberate flags: characters filled in (咖啡, shown only as pinyin) and a Simplified spelling (电脑);
  - `startRun(id, config, provider)` skips usage tracking, and `ImportRecord.demo` tags the added cards `sample`;
  - resuming a paused demo redraws the page instead of asking for the file.
- **Existing devices:** `initOnboarding` runs at start-up. Tips, the tour and the checklist wait for it.

**State:**
- Device-only, in localStorage `mandarin-leitner.onboarding` (`lib/onboarding.ts`): tips seen, tour done, checklist
  dismissed, direction chosen, backup saved.
- When it is first created on a device that already has review history, everything is marked seen, so people who used
  the app before (or arrive with synced history) get no tour or tips.
- Settings → Help & tips can replay the tour or show the tips again.
- Like the theme, it is neither synced nor backed up. Seeing a tip again on a second device is cheap; syncing UI state
  is not.

## Consequences

- Help text must be kept true to the app; `topics.ts` says so at the top.
- Sample cards behave like any card until removed; deleting them is a normal soft delete that sync carries.
