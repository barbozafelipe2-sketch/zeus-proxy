# Zeus Proxy Personal Recovery

## OH-004.3.4-personal polish — 2026-10-03
- Access key persists in `localStorage` as `olyhub.zeusproxy.access.v3` (legacy v2 keys migrate automatically); build verifier and tests updated to match.
- Accessibility: landmarks, labels, ARIA state, skip link, live region, focus preservation, `Escape` handling, focus ring, reduced motion and AA text contrast.
- Resilience: drafts survive re-renders, friendly offline/network errors, dismissible error banners on every page, busy indicator, offline status, no stale status timers.
- Mobile: safe-area insets for the iOS home-screen app and landscape notches.
- Head metadata (description, noindex, Open Graph, color-scheme), boot placeholder and `<noscript>` fallback.
- Security: HSTS, COOP, explicit `manifest-src`/`worker-src`; transcribe/files return JSON 400s for malformed uploads.
- Removed dead bottom-nav code and unused CSS; fixed an invalid `transition` declaration; replaced exceljs's deprecated `uuid@8` with `uuid@11` via npm override.

## OH-004.3.4-personal — 2026-10-03
- Restored the complete audited OH-004.3.4 workspace after the OH-001.2.x reduced chat-shell regression.
- Preserved the personal black/gold Zeus identity while restoring Projects, one permanent chat per Project, dedicated memory, tasks, files, artifacts, image/vision, voice and durable execution state.
- Limited user-facing modes to Zeus and Olympus.
- Replaced commercial Netlify Identity with the existing server-side `ZEUS_PROXY_ACCESS_TOKEN` single-owner gate.
- Changed the composer `+` into Photo/Image · Video · File choices and made Enter insert a newline.
- Added bounded same-provider OpenAI model fallback and prevented blind retries on auth/quota/rate-limit/invalid-request failures.
- Converted the production smoke harness to the private Zeus access contract.
- Ported current OlyHub live web research into Zeus Proxy through the Netlify Gateway-backed OpenAI Responses `web_search` tool, including persistent HTTP/HTTPS source citations.

# Changelog

## 4.3.4 — Polish Candidate

- Repositioned Zeus as the default execution mode and Olympus as a bounded specialist synthesis mode; removed misleading deep-research copy while web retrieval is disabled.
- Added source-grounding and capability-honesty instructions across Zeus, Olympus specialists, Zeus integration, and the Olympus Director.
- Added query-aware excerpts for long current attachments so relevant later sections can reach the model context.
- Added runtime-aware READY / LIMITED / SYNCING topbar status instead of a permanently optimistic ONLINE label.
- Refined mode cards, Home prompts, composer persistence guidance, mobile safe-area behavior, focus/hover treatments, auth surfaces, and output interactions.
- Added executable live Netlify smoke testing for Identity / Database / Blobs / Project lifecycle, with an optional real Zeus source-grounding turn.
- Added GitHub verification and manual live-smoke workflows.
- Declared the npm toolchain (`npm@10.9.2`) in package metadata in addition to the existing exact direct dependency pins.
- Added a real npm v3 `package-lock.json`, generated successfully by GitHub Actions from the exact-pinned 4.3.4 manifest; repository verification now uses `npm ci`.
- No database migration added.

## 4.3.3 — Final Fix 3/3

- Moved active Netlify Identity access tokens to memory-only storage; refresh tokens are kept only in sessionStorage for the current browser-tab session.
- Added one-time migration/removal of the legacy persistent `localStorage` auth payload.
- Added no-store behavior to Identity client requests and Netlify Identity response headers.
- Rebuilt PDF line wrapping around actual font width, long-token splitting, punctuation normalization, and safe fallback for unsupported glyphs.
- Exposed the complete task lifecycle in UI: TODO → IN_PROGRESS → DONE → TODO.
- Added accessible Project modal lifecycle: dialog semantics, labels, Escape close, Tab focus trap, inline errors, background scroll lock, and focus restoration.
- Exact-pinned all direct production dependencies and declared Node `22.x`; added `.npmrc` reproducibility policy.
- Retried package-lock generation; registry timeout prevented a trustworthy lockfile, so no synthetic lock was committed.
- Added Final Fix 3/3 regression tests and verifier gates.
- No database migration added.

## 4.3.2 — Final Fix 2/3

- Zeus complex-review escalation now remains available after a lead provider/model fallback instead of being silently disabled.
- Olympus reserves explicit wall-clock time for Director synthesis; specialist and critic calls cannot consume that reserve.
- Provider diversity became quality-bounded rather than an unconditional preference for a different provider.
- UI/UX specialist routing no longer maps to writing-only capability; visual work can prefer multimodal models.
- Added deterministic Project memory selection: max 40 items / 15k characters, ranked by type priority, confidence, then recency, with duplicate collapse.
- Updated Memory UI to state the actual context policy rather than implying every saved item is injected in full.
- Provider diagnostics now use persisted execution evidence from the last 24 hours and distinguish configured, observed healthy, recent failure, degraded, and unavailable states.
- Tools/capability labels use CONFIGURED when capability exists but has not been verified by runtime evidence.
- Health/bootstrap now opportunistically drains queued Blob cleanup; GC retries are bounded and use increasing backoff.
- File/artifact downloads now use request IDs, shared error codes, runtime shields, and correlation headers.
- Added Final Fix 2/3 regression tests, including a mocked Zeus fallback -> review -> integration execution.
- No database migration added.

## 4.3.1 — Final Fix 1/3

- Fixed stale global-vs-project output scope when moving between Projects, Files, Tools, and chat history.
- Opening a Project conversation from history now hydrates Tasks, Memory, Files, and Artifacts before rendering the workspace.
- Added owned DELETE lifecycle for individual Files and Artifacts with durable Blob GC queue cleanup.
- Added Project delete control to the product UI; backend cascade/GC semantics from Hard Fix remain authoritative.
- Added per-type artifact input/structure budgets plus a 12 MB generated-output ceiling to protect synchronous Functions.
- Documents capability is no longer shown READY unless chat/AI capability is actually ready.
- Consolidated XLSX parsing on the already-used `exceljs` dependency and removed the redundant `xlsx` package. Legacy `.xls` now returns a truthful conversion message instead of relying on the removed parser.
- Added Final Fix 1/3 regression tests and verifier guards.
- No database migration added.

## 4.3.0 — UI refinement
- Preserved the OH-004.2.10 foundation and made no backend/database migration changes.
- Refined the global visual system: near-black canvas, graphite depth, restrained metallic gold, tighter type scale and stronger spacing rhythm.
- Redesigned desktop sidebar navigation, recent chats, account footer and top workspace header.
- Refined Zeus/Olympus mode selection, Home welcome state, chat messages, inline outputs, execution/error states and composer.
- Converted Projects from dense rows into premium workspace cards with status, progress and contextual metrics.
- Refined the complete Project workspace across Chat, Overview, Tasks, Files and Memory.
- Reworked Tools cards with truthful READY / COMING LATER states and clearer capability hierarchy.
- Refined Files, outputs, Settings, auth and modal surfaces.
- Added keyboard activation for Project cards, accessible task/memory controls, focus-visible styling and reduced-motion support.
- Added UI regression tests and preserved all Hard Fix 1/2/3 tests.

## 4.2.10 — Hard Fix 3/3
- Preserved the working 4.2.7 product UI and all Hard Fix 1/2 invariants.
- Added ZIP central-directory safety preflight for generic ZIP, DOCX, PPTX and XLSX containers before decompression.
- Added entry-count, expanded-size, per-entry-size and compression-ratio budgets plus encrypted/ZIP64/multi-disk rejection.
- Removed README-only ZIP fake success and added generated ZIP manifest/path/size validation plus post-generation verification.
- Added cursor pagination to chat history, files and artifacts, including direct Project-scoped file/artifact queries.
- Added UI controls to load older chat history and outputs without loading permanent history all at once.
- Added durable AI concurrency/hourly safeguards using Postgres advisory locking and existing executions.
- Added durable per-user endpoint rate events for upload, direct artifact creation, transcription and storage maintenance.
- Added Blob garbage-collection queueing around Project deletion and failed cleanup paths.
- Added authenticated `/api/storage-maintenance` queue drain and bounded DB-to-Blob health sampling.
- Added same-origin CSP/permissions hardening and made partial startup failures visible instead of silently rendering empty data.
- Added actual ZIP-entry decompression verification so declared central-directory sizes are not trusted on their own.
- Added Hard Fix 3 runtime-contract tests for raw archive parsing, ZIP manifest validation, pagination and AI guard behavior.
- Added additive migration `20261001043000_hard-fix-3-operations`; no previous migration changed.

## 4.2.9 — Hard Fix 2/3
- Preserved the working 4.2.7 product UI and all Hard Fix 1 integrity guarantees.
- Added deterministic bilingual PT/EN intent routing for analyze/create/edit/artifact/chat.
- Fixed ZIP/image intent collisions (analysis no longer creates artifacts; background questions no longer edit images).
- Rebuilt AI context ordering so current attachments are protected first and older project files are relevance-ranked.
- Added secret redaction and sensitive credential/config filename blocking before AI context leaves the app.
- Added real image understanding inputs for supported uploaded image types.
- Added a request-wide deadline and bounded model-call budgets for Zeus, Olympus, image generation/editing and transcription.
- Bounded Olympus to 2 primary specialists normally / 3 for complex work, with an optional single challenge critic plus Director.
- Added a warm-runtime provider circuit breaker after repeated failures.
- Made server transcription require an explicit audio-compatible endpoint/key instead of assuming the chat AI Gateway exposes audio transcription.
- Added Hard Fix 2 unit tests for routing, privacy redaction, context priority/budget, execution budget and circuit behavior.
- No database migration changes in this pass.

## 4.2.8 — Hard Fix 1/3
- Kept OH-004.2.7 UI/product surface unchanged.
- Added canonical one-conversation-per-Project database invariant and legacy duplicate merge migration.
- Changed Project deletion so workspace conversations/files/artifacts do not become Home data.
- Added idempotent chat request IDs and Retry reuse instead of duplicate user turns.
- Added replay of already-completed executions for network-loss retries.
- Added transactional DB finalization for assistant messages, artifact rows, execution completion and conversation timestamp.
- Added staged Blob cleanup when DB finalization fails.
- Added Project/Conversation ownership and relationship validation for files/artifacts/chat.
- Added project-scoped attachment validation.
- Made Project PATCH partial-safe and strict for invalid status/progress.
- Preserved PAUSED lifecycle state during task progress synchronization.
- Added due-date validation before task writes.
- Added request correlation IDs across browser/core API errors.
- Added Hard Fix 1 unit tests for transaction commit/rollback and scope validation.
- Original foundation migration remains byte-for-byte unchanged.

## 4.2.7 — Product finish pass
- Based only on the working OH-004.2.5 FULL RECOVERY baseline.
- Added Project workspace tabs: Chat, Overview, Tasks, Files and Memory.
- Added visible project-memory management through `/api/memories` using the existing `memories` table.
- Added manual approved project memory creation and deletion.
- Added Project Overview with real task/file/artifact/memory counts.
- Added full Project Files view with project-scoped uploads and generated outputs.
- Added richer task creation with priority and due date.
- Added Project edit UI for name, goal, description and status.
- Preserved permanent embedded Project chat and Zeus/Olympus switching inside the Project.
- Removed simulated execution timings/checklist completion states.
- Fixed artifact actions so non-PDF outputs no longer show "View PDF".
- Renamed the data capability to Data Review to match the current implementation honestly.
- Added regression checks for project memory UI/API and fake execution timings.
- Preserved secure server auth, project context isolation, voice behavior, model fallback, ZIP analysis/creation and valid execution states from 4.2.5.

## 4.2.5 — Runtime hardening + project isolation
- Working recovery baseline used for this release.
