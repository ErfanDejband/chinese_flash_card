# ADR 0009: Pictures for cards (sheets, cut apart)

**Status:** accepted (2026-10-11). Builds on [ADR 0008](0008-reading-pages-and-known-words.md) (words from reading pages have no picture).

## Context

The default practice direction is picture → Chinese. Cards made from reading pages, and many cards typed by hand, have no picture, so
they fall back to showing the English meaning. The learner wants pictures for them, kept as cheap as possible.

Facts at the time (October 2026):
- Claude can't generate images.
- Gemini image models have no free API tier (about $0.034–0.13 per image).
- OpenAI GPT Image models cost about $0.005–0.06 per image, depending on quality and size.
- OpenRouter offers about 60 image models through one key (its Image API), none of them free, and reports the cost of each request.
- All three accept browser requests (CORS).

## Decision

- **One image holds several pictures (a "sheet").** The image model draws a grid of 4, 6 or 9 pictures (2×2, 3×2 at 3:2, 3×3),
  one per word, with white gutters and no text. That costs the same as one picture, so each picture costs ¼ to ⅑ as much.
  Only the 1:1 and 3:2 shapes are used, because every model supports them.
- **Locate, then cut.**
  - A vision call to the import AI (free on the free plan) returns a box per word, in the `NormBox` format that page crops
    already use, and `cropFromImage` cuts the pictures out.
  - A box that is implausible (tiny, most of the sheet, overlapping another) or missing falls back to the word's grid cell.
  - The user can fix any crop with the same editor as page crops (`BoxEditor`, extracted from the import `CropEditor`).
- **Planning call first** (text-only, 30 words per request, import AI):
  - for each word: whether it can be pictured, a concrete English scene, one emoji and a search phrase;
  - abstract words (很, 因為, 的) start excluded at no cost, and the user can still include them;
  - without an import AI, every word is included and its meaning is drawn.
- **Paid styles:** flat icon and sticker (low quality: cheapest on OpenAI models), textbook sketch (like the course book), storybook (like the kids' book)
  and photo (medium). Style and pictures per sheet are chosen on the picture screen and remembered.
- **Estimates before running:**
  - a dated price table (`pictures/estimate.ts`): OpenAI per-image prices by quality and shape, with token counts where published,
    and Gemini per-image prices;
  - other OpenRouter models show "price shown after", and OpenRouter reports the real cost afterwards;
  - usage goes into the existing AI usage counters.
- **Services:**
  - OpenRouter, OpenAI and Gemini, in `pictures/generators/`;
  - settings under `mandarin-leitner.ai` → `pictures`, so they stay on the device;
  - existing keys are reused (the free sign-in or own OpenRouter key, a Gemini key, an OpenAI key), or a key can be entered for pictures only;
  - auth errors, no credit (402), used-up quota and unknown models stop the run; other sheet failures don't stop it.
- **Free option now:** emoji, picked by the planning call and drawn on a canvas with the device's emoji font. AI-drawn SVG and
  picture search follow (Phase 12).
- **Work tables (Dexie v5):** `pictureJobs`, `pictureSheets` and `pictureDrafts`. They stay on the device, aren't synced or backed up,
  and survive closing the app. Nothing touches a card until "Save":
  - results show in a grid (keep or untick, Adjust crop);
  - "4 new" makes one 2×2 sheet with four versions of that word, for the price of one picture, and the user picks one;
  - Save writes the kept pictures with `setCardImage`.
- **Entry points:** the import's finished view ("Add pictures" for the new cards without one) and Cards → "No picture" → "Add pictures
  to N cards". There's also a link back to unsaved pictures.

## Consequences

- A typical reading page (about 12 picturable words) costs about $0.01–0.03 in AI pictures, plus the locate requests on the import AI.
- Cutting depends on the image model following the grid. Locate fixes misplaced pictures, the grid fallback covers locate failures,
  and the crop editor covers the rest.
- Pictures don't sync until sync step 2 (images).
