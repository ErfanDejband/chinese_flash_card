# ADR 0003: PDF extraction as a two-stage, pluggable pipeline

**Status:** accepted (2026-09-25), implementation pending sample PDFs

## Context

Course PDFs contain vocabulary items (characters, pinyin, image, sometimes English) mixed with other
material, and layouts vary between sources. Extraction mistakes are expected, so the user reviews every
candidate before import.

## Decision

`src/import/` is UI-free and has two stages:

1. **Layout reader** (pdf.js in a Web Worker): per page, text items with bounding boxes (classified as
   CJK / pinyin / English / other) and image regions (from the operator list's transform matrices).
   Images are cropped from a high-DPI render of the page, which is robust to masks and odd encodings.
2. **`Extractor` interface**: `extract(pages) → CandidateCard[]`, each with confidence, warnings and
   provenance (page + bbox). The first implementation is rule-based (nearest hanzi/pinyin/English around each
   image, confirmed by a pinyin-pro reading check). An AI extractor (vision LLM) can later implement the
   same interface.

The Import Review screen edits candidates; commit creates cards in one transaction, in document order.
An eval harness (hand-labelled expected cards for sample pages → precision/recall) guards layout tuning.

## Consequences

- Free, offline, deterministic extraction for known layouts; new layouts mean new rules or the AI extractor.
- Sample PDFs stay out of git (copyright); the eval test is skipped when they are absent.
