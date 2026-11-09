# Hard Fix 2/3 — AI Runtime, Context, Privacy, Vision

This pass keeps the working OH-004.2.7/4.2.8 product and integrity foundation intact and repairs the AI/runtime defects identified in Hard Audit 2/3.

## Fixed in this pass
- Deterministic bilingual PT/EN intent routing separates analysis, image creation, image editing, artifact creation and normal chat.
- File-type nouns alone no longer trigger artifact creation. `Analyze this ZIP` remains analysis; `Create a ZIP` creates a ZIP.
- Image editing requires an attached image plus an explicit edit verb. Merely asking what is in the background no longer routes to image editing.
- Current-turn attachments are first in the model context budget, ahead of memories, history, project identity/tasks and older project files.
- Older project files are ranked for relevance before being included.
- Secrets are redacted before model calls. Sensitive config/credential files such as `.env`, private keys and service-account files are omitted from AI extraction context.
- User text and explicit project memories are scrubbed before being sent/stored as permanent AI memory when credential-like data is detected.
- Zeus/Olympus receive real image inputs for supported PNG/JPEG/WebP/GIF attachments rather than only a filename placeholder.
- Text provider calls share one global request deadline and model-call budget.
- Olympus is bounded to 2 primary specialists normally or 3 for complex requests, with at most one explicit challenge critic, then one Director synthesis.
- Provider failures feed a bounded warm-runtime circuit breaker so repeatedly failing providers are temporarily skipped instead of wasting every request timeout.
- Image generation/editing and optional transcription use a total budget and at most two provider/model attempts.
- Server transcription requires an explicit audio-compatible base URL and API key; the normal chat AI Gateway is no longer assumed to expose `/audio/transcriptions`.

## Deliberately deferred to Hard Fix 3/3
- Durable per-user rate limiting/concurrency limiting.
- ZIP decompression/entry budgets and ZIP output structural verification.
- Conversation/file/artifact cursor pagination.
- Blob garbage collection/reconciliation.
- End-to-end Netlify integration tests.

## Runtime limits
OlyHub leaves a safety reserve before the synchronous Function wall-clock limit. A provider or Olympus council that cannot finish inside the request budget fails cleanly rather than starting fallbacks that cannot possibly finish.
