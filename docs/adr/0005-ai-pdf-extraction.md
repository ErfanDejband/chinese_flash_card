# ADR 0005: AI-assisted PDF extraction with the user's own API key

**Status:** accepted (2026-09-26). Supersedes the rule-based extractor in [ADR 0003](0003-pdf-extraction-pipeline.md).

## Context

The two sample course PDFs showed that layout rules cannot work:
- In the pronunciation book, the vocabulary is **inside images**. Each picture only has a pinyin label, and the Chinese characters are missing entirely.
- In the vocabulary book, 生詞 slides do have a real text layer (characters, pinyin, English), but there are also multi-item
  pages, sentence slides, word tables and grammar pages.

Future PDFs will have other layouts. The characters for picture + pinyin items have to be *inferred*, which needs
language understanding plus vision.

## Decision

- **One vision-LLM request per selected page.** The page is rendered to a JPEG (~1536 px) and sent with the page's text layer as a hint.
  The hint is exact when present, and costs nothing to include.
- **The user supplies the key**, and the key is stored in `localStorage` on the device only. It is never exported in backups, and it is sent
  in a request header to the chosen provider only. Two adapters sit behind the `VisionProvider` interface (`src/import/ai/`):
  - **Gemini** `generateContent` with `responseSchema` (JSON mode). Gemini is the default because of its free tier and its native 0–1000
    bounding boxes, which we need to crop each picture out of a slide.
  - **OpenAI-compatible** `chat/completions` with `response_format: json_object` (OpenRouter free models, Groq, OpenAI, LM Studio/Ollama).
- **The prompt** (`src/import/ai/prompt.ts`, versioned) asks for items of kind `word` or `sentence`. Each item has:
  - Traditional (Taiwan) hanzi, pinyin and an English meaning;
  - whether each of those was *printed or inferred*;
  - an `imageBox` in `[ymin, xmin, ymax, xmax]` 0–1000 coordinates;
  - a confidence score.
- **Nothing is trusted blindly.** Local post-processing (`src/import/extract/postprocess.ts`) adds review flags:
  - pinyin-pro reading check, which also validates inferred characters and tolerates neutral tones (鴨子 yāzi);
  - Simplified-only characters, via OpenCC character tables with a dual-use allowlist such as 台 and 后;
  - duplicates, missing characters and low confidence.

  Every candidate is then reviewed, editable and re-croppable before it becomes a card.
- **Resilient runs.** Pages are processed sequentially. Retry-After and backoff are honoured, a rejected key or an exhausted quota stops the run,
  and each page is persisted as it finishes (`importPages`, `importDrafts` in Dexie v2). An interrupted import can be resumed; the user
  re-selects the PDF, which is checked by hash. Rendering uses pdf.js's `print` intent, so a background tab keeps working.
- **Commit** creates cards in page and reading order, so they enter the new-card pool in document order. Each card keeps its PDF provenance
  (file, page, picture box) and the work tables are deleted.

## Consequences

- Handles any layout the model can read, including characters that exist only implicitly.
- Needs network access and an API key. Free tiers have rate and daily limits, and may use submitted content for training (the UI says so).
- Quality depends on the model. The review flags plus pinyin-pro and OpenCC checks catch the most common failures: wrong characters,
  Simplified output, and misread tones.
- Heavy code (pdf.js ≈ 430 kB, pdf.js worker ≈ 1.3 MB, full OpenCC ≈ 1.1 MB) is lazy-loaded and excluded from the offline precache.
