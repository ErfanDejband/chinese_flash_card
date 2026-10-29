# ADR 0011: Snap, cards from a photo of things around you

**Status:** accepted (2026-10-29).

## Context

The user wanted a tab where a learner photographs their surroundings and gets flashcards for the objects in it. A photo
usually holds many objects, and the user preferred not to pay an AI service to find them if the phone could do it.

## Options considered

- **AI only** (a vision model finds, boxes and names everything in the whole photo):
  - simplest, but costs more, takes 10–110 s, and sends the whole photo;
  - boxes from many models are loose.
- **On-device detection:**
  - MediaPipe EfficientDet knows only 80 COCO classes.
  - **D-FINE-S trained on Objects365** knows 365 everyday classes, is Apache-2.0, and comes as int8 11.3 MB or fp32
    42.1 MB.
  - Open-vocabulary models (OWLv2, Florence-2, YOLO-World/YOLOE) are 150–400 MB or more, and the Ultralytics ones are
    AGPL.
- **Chrome's built-in Gemini Nano** (Prompt API with images): not available on Chrome for Android.

The user's own idea was the deciding refinement: **the phone finds the objects, the learner picks them, and the AI only
names the chosen ones**.

## Decision

**Finding objects on the device**
- D-FINE-S Objects365 through Transformers.js (`src/vision/`).
- **The detector is a finder, not a namer.** Its English labels are often wrong (Mouse for a game controller), but its
  boxes are right. The labels go to the AI only as hints and are never shown.
- **Suggestions, not a score threshold:** the best N after merging overlapping boxes across labels (N = 6 by default,
  adjustable). Very large boxes become "Also in the photo" chips. "Person" is hidden.
- **Dots** by default (a box once chosen), or boxes.
- **Choosing:** the smallest thing under the finger wins; a tap on an empty spot makes a small adjustable box; a box can
  also be drawn.

**Naming with the AI**
- The chosen objects become **one numbered mosaic** of padded crops (224 px cells), sent in **one request** to the
  user's AI service (`OBJECT_NAME_TASK`).
- Most services charge an image by its area (Gemini by the image), so this costs much less than the whole photo.
- Measured with Gemini 3.8 Flash: about the same input tokens, half the output, 1.5–2.5× faster, and every name right.

**Word choices** (`OBJECT_NAME_TASK` v2)
- The **everyday word first** (basic-level words are learned first; Rosch et al.), then up to 2 more precise words
  common in Taiwan.
- Each word gets an AI-estimated TOCFL level.
- The category becomes a tag.
- "My level" preselects a word.
- Keeping two words for one object is optional, with a hint: very similar words learned together interfere (Tinkham 1993,
  Waring 1997).

**Model and hosting**
- WebGPU fp32 where available (about 0.25 s per photo on the user's phone), otherwise WASM int8 (about 1 s). If WebGPU
  fails, the app falls back to WASM.
- **Never fp16:** WebGPU fp16 found nothing on an Adreno GPU, though the same model works on WASM.
- **Self-hosted on the app's own site:** `scripts/fetch-vision.mjs` fetches the pinned revision (SHA-256 checked) and
  copies the ONNX runtime at `predev` / `prebuild`.
- Not precached; cached by Transformers.js after first use, so it works offline after that.

**The app**
- **Snap is the raised camera button in the middle of the bottom bar.**
- Cards moved to Settings → Your cards, and the Settings tab stays lit there.
- Cards from Snap use the crop as their picture, are tagged `snap` plus the category in Chinese, and have source `manual`.
- The hidden `/lab/objects` page stays for benchmarks and shares Snap's components.

## Consequences

- The first Snap downloads about 18 MB (WASM: an 11 MB model plus a 7 MB gzipped runtime) or about 49 MB (WebGPU: the
  42 MB fp32 model plus the runtime).
- The deploy grows by about 80 MB of model and runtime files.
- Vite also emits an unused copy of the runtime `.wasm` (about 27 MB), still to be removed.
- The privacy policy has a Snap paragraph.
- Transformers.js checks optional model files (`tokenizer.json`…) and needs a real 404 for the missing ones. GitHub Pages
  answers 404; the dev and preview servers get a small plugin (`snapFiles404`). The model path must be a path, not a
  full URL.
- Not yet: example sentences for Snap words, the official TOCFL word list (licence unclear), an offline name list, a live
  camera view, and SlimSAM tap-to-outline.
