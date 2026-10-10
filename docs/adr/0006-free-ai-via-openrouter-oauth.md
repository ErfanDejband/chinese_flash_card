# ADR 0006: Free AI import via "Sign in with OpenRouter"

**Status:** accepted (2026-10-10). Extends [ADR 0005](0005-ai-pdf-extraction.md); the own-key setup is unchanged.

## Context

AI import needs a vision model. Until now the user had to create an API key at a provider and paste it into Settings.
That is fine for developers but is the main barrier for general users. Free multi-model routers exist (OpenRouter's free
models, xKiro, Puter.js), and the question was whether the app can use them "automatically".

The app is a static PWA on GitHub Pages with no backend.

## Options considered

- **Ship a shared key in the app.** Rejected. Anything in the bundle is public, so the key would be scraped and drained,
  and that breaks provider terms. Every user would also share one account's free quota: OpenRouter governs free
  capacity per account, and extra keys don't add any.
- **A proxy backend holding our key** (e.g. a serverless function). Rejected. It has the same shared quota, plus
  hosting, abuse protection and liability for other people's traffic.
- **OpenRouter OAuth PKCE ("Sign in with OpenRouter").** Chosen. It needs no backend, no client registration and no
  secret. The user authorises the app at openrouter.ai (Google or e-mail sign-up, no card) and comes back with a one-time
  code, which the app exchanges for the user's own key. Each user has their own free quota.
- **xKiro** (OpenAI-compatible gateway). Not now:
  - it still requires copying a key and has no sign-in flow for apps;
  - the free allowance is 500k tokens/day (1M with Telegram verification);
  - the operator isn't named.
  It can be used today through "Other OpenAI-compatible".
- **Puter.js** ("user-pays": users sign in to Puter in a popup). Not chosen:
  - it needs a third-party script and a separate adapter;
  - the free allowance isn't stated;
  - there's no structured JSON output.

## Decision

- Settings → AI offers two modes: **Free — no key** (the default on a fresh device) and **My own API key** (the
  previous screen, unchanged). The two setups are stored side by side (`mode` + `free.apiKey` in `mandarin-leitner.ai`),
  so switching never loses either one. Devices with an existing own-key setup stay in own-key mode.
- **Sign-in flow** (`src/import/ai/openrouterAuth.ts`, `src/lib/openrouterSignIn.ts`):
  1. Create a PKCE verifier and an S256 challenge, plus a random `state`.
  2. Store `{verifier, state, returnTo, createdAt}` in **localStorage**. An installed Android app may receive the redirect in
     a browser tab, which shares localStorage but not sessionStorage.
  3. Redirect to `https://openrouter.ai/auth?callback_url=<app root>&code_challenge=…&code_challenge_method=S256&key_label=…&state=…`.
  4. On startup, `?code=…&state=…` is accepted only if it matches a pending sign-in that is less than 15 minutes old. The URL is
     cleaned at once, the code is exchanged via `POST /api/v1/auth/keys`, the key is saved and free mode is activated.
     A `storage` listener updates other open windows of the app.
- **Model:** `openrouter/free`. OpenRouter picks a free model per request, among those that support the request (image input,
  `response_format`). The existing OpenAI-compatible adapter is reused. The model actually used is reported per page.
- **Quota:** free models allow 20 requests/min and 50 requests/day (1,000/day after $10 of lifetime credits). The app shows the
  remaining count from `GET /api/v1/key` (`free_model_daily_requests`). A 429 that signals a used-up daily allowance becomes a
  `quota` error, which stops the run at once ("resume tomorrow") instead of retrying.

## Consequences

- No key to copy and no cost. About 50 pages a day per user, enough for a lesson at a time.
- Quality varies from page to page, because the free router may pick a different model each time. The existing checks still
  apply: the pinyin check, Simplified detection, low confidence and the user's review.
- Page images go to OpenRouter and the free model it picks. Free providers may log or use submitted content, and the
  Settings privacy note says so.
- The callback URL is the app root (`location.origin + BASE_URL`); OpenRouter allows localhost on any port for development.
  Revoking a key happens on openrouter.ai; "Disconnect" only forgets it on the device.
