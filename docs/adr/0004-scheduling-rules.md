# ADR 0004: Leitner scheduling rules

**Status:** accepted (2026-09-25)

All rules are pure functions in `src/domain/leitner` and `src/domain/session`, covered by table-driven tests.

| Rule | Default | Configurable |
|---|---|---|
| Boxes and intervals | 5 boxes: 1, 2, 4, 7, 14 days | 3–10 boxes, 1–365 days, non-decreasing |
| Knew | move up one box, due after that box's interval | — |
| Knew in the last box | stays in the last box | — |
| Forgot | back to Box 1 (`reset`) | or down one box (`demote`) |
| New cards | wait in a pool (box 0); a new card is answered as if in Box 1 | — |
| New cards per day | 15 | 0–500; "learn more" sessions can exceed it |
| Granularity | calendar days in local time (`YYYY-MM-DD`) | — |

**Within a session:** a forgotten card is re-queued at the end and practised until known, but only the
**first answer of the day** changes its box. Session order: due cards from the lowest box up
(shuffled within a box), then new cards oldest first.

**Why day granularity:** Leitner intervals are in days. Comparing `YYYY-MM-DD` strings avoids time-zone and
DST bugs (date arithmetic is done in UTC on calendar dates).

**Config changes:** cards in a box that no longer exists are treated as being in the last box
(`effectiveBox`); nothing is rewritten.

**Undo:** each persisted answer returns a token (the previous state + log id); undo restores the state
with a fresh `updatedAt` and deletes the log entry.
