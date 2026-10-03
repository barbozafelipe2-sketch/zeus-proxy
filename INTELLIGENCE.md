# OlyHub 4.3.3 intelligence behavior

OH-004.3.3 keeps Zeus as the default execution mode and Olympus as the bounded multi-specialist mode, while tightening review behavior, quality-aware provider diversity, Director time reservation, and memory/context policy.

## Zeus
- Selects a lead model dynamically from configured, non-circuit-open providers.
- Keeps OpenAI as the final compatible fallback when non-OpenAI providers are available.
- Uses a request-wide deadline/call budget instead of independent unbounded retries.
- Can perform one bounded specialist review for sufficiently complex work when budget remains.
- A lead fallback no longer disables that review. Failed lead candidates are excluded from the reviewer choice, and the existing four-call ceiling still bounds the path.
- Receives real supported image inputs (PNG/JPEG/WebP/GIF) when images are attached.

## Olympus
- Detects relevant domains and uses **2 primary specialists normally** or **3 for complex work**.
- Uses at most **one critic**, and only for an explicit challenge/adversarial request.
- Synthesizes through one Director result rather than concatenating competing drafts.
- Reserves a dedicated wall-clock window for the Director. Primary specialists and the optional critic are not allowed to consume this reserve.
- Provider diversity is a preference only when the alternate provider's score is close enough to the strongest available candidate; material quality is not sacrificed simply to use a different provider.
- UI/UX work routes to reasoning/design capability and prefers multimodal capability when visual input is present rather than being mapped to writing-only models.
- Tolerates partial specialist failure and records sanitized attempt metadata.
- Falls back to Zeus only when there is still execution budget available.

## Context
Project turns are assembled in this priority order:
1. Current-turn attachments.
2. Approved permanent Project memory.
3. Recent persistent conversation history.
4. Project identity/goal.
5. Project tasks.
6. Older Project files ranked for relevance.

The full conversation remains stored in the database; only a bounded working context is sent to models.

### Approved-memory policy
The Memory screen can retain/show up to 200 approved items. Each AI turn deterministically selects at most **40** memories within a **15,000-character** memory section. Ranking is type priority, confidence, then recency; explicit instructions outrank ordinary manual notes. Normalized duplicate memory text is collapsed before context assembly.

## Privacy guard
- Sensitive credential/config files such as `.env`, private-key files and service-account files are omitted from extraction context.
- Extracted text and model-bound user/context text are scrubbed for common API keys, tokens, passwords, private keys and credential-bearing URLs.
- Raw uploaded files remain stored as the user's files; the scrubber controls what is sent into AI context.

## Provider health
The model runtime still has a short-lived in-memory circuit breaker, but Settings no longer treats that alone as global provider truth. Provider readiness also uses persisted OlyHub execution evidence from the last 24 hours and reports states such as **CONFIGURED UNVERIFIED**, **OBSERVED HEALTHY**, **RECENT FAILURE**, and **DEGRADED**. Image/audio endpoint readiness remains configuration-based until those capabilities are actually exercised.

## Voice
Browser-native speech recognition remains first choice. Server transcription is optional and only enabled when an explicit audio-compatible endpoint and key are configured through `OLYHUB_AUDIO_BASE_URL` and `OLYHUB_AUDIO_API_KEY` together with `OLYHUB_SERVER_TRANSCRIPTION=true`.
