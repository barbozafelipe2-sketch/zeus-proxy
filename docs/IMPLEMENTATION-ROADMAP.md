# Zeus Proxy — locked execution requirements and implementation plan (2026-10-14)

Status: implementation specification. **Do not mistake this file or a staged Git object for deployed functionality.**

## Guiding principle

Zeus Proxy adapts to each owner's working style. The owner may work incrementally with Zeus, ask Olympus to assemble and audit later, or ask Olympus to build a simple system from the beginning. **The owner's personal incremental workflow is not a mandatory rule for everyone.** Only Zeus and Olympus are top-level visible modes. The internal router is deterministic: **zero AI classification calls**.

## Execution hierarchy

- Zeus Level 1: one economical specialist for short explanations, translations, text and small tasks.
- Zeus Level 2: one economical domain specialist + generalist Director for standalone moderate deliverables including logos and simple documents.
- Zeus Level 3: one domain specialist + domain Director + strong generalist CEO for professional UI, backend, presentation and complex single-domain artifacts. The persistent workspace and resumable multi-phase execution are available **here too**.
- Olympus: multiple economical domain specialists (normally visual plus coding for full apps), domain Directors as appropriate, generalist integration Director and CEO. Minimum necessary calls and phases, not a fixed roster. Default manual selection respects owner control; allow auto behavior as a user-configured option rather than hardcoding it.
- Any domain role is selected by tested ability/price/availability. Strongest models are reserved for Directors and CEOs only when necessary; never equate role names with a fixed vendor.
- A visual deliverable must be reviewed by models able to inspect visuals; producing real HTML/ZIP/PDF requires an artifact-capable engine, not merely a written promise.

## Adaptive per-project workspace

All modes and Zeus levels can discuss requirements and update approved project decisions without starting paid artifact creation. When user requests preview: produce low-cost interactive HTML/CSS/JS when practical or a static image when appropriate; save versions. Production begins only when user requests generation.
Store per-phase files, accepted requirements, approved previews, dependencies, provenance, version manifest, model usage, current phase, pending work, generated artifacts, tested status, and resumability tokens. Use content-addressed references and avoid refeeding complete files unnecessarily. Keep owner/project isolation. Multi-phase can be 1, 2, 3, 4+ depending on scope, context, available time and size; always checkpoint between lengthy steps. Never claim background progress without a functioning worker/job.
Compare & Evolve: real independent A/B outputs, Try Again, Choose A/B, Combine C, originals preserved; domain-aware merging and versioned user feedback across supported artifacts.

## Current 3-part completion pass

**Part 1/3 — Compare & Evolve (implemented locally):** PDF, XLSX, PPTX and HTML requests can generate two separately stored outputs from different model families; calls are isolated, output validation must pass for both, artifacts retain provenance, and the owner can save a preferred alias, request another pair, or attach both originals to prepare a new C. If two families are not configured, the request fails before generation. Live research is explicitly excluded from this two-call flow. Other formats (including image, audio, video and 3D) are upload-and-compare only; metadata comparison does not claim to inspect binary contents. Tests cover family separation and the UI/library flow. No production database, provider, mobile or deployment verification is implied.

**Part 2/3 — Google read-only integrations (implemented locally):** each service has its own OAuth consent, Gmail and Calendar return bounded results, and Drive lists metadata only under the narrower metadata-read scope. Access and refresh tokens are encrypted at rest; access tokens refresh server-side; disconnect attempts Google revocation before deleting local credentials. Settings can search connected services, and explicit chat requests add returned records as untrusted context. Mocked service tests cover token encryption/refresh, API shapes, bounded requests, query failures and auth boundaries. Real Google credentials, API enablement and OAuth consent still need live validation; setup and current Google test-user behavior are documented in README. Part 3/3 remains: full release gates, review the combined changes, and make the single final commit.

## Costs and safe retry

- Zero-token route/planner. Economical specialist, stronger domain Director, premium generalist CEO only when benefit justifies it.
- Olympus **optimization target $6.50 per full-system build**, not a spending floor; actual job may cost $2/$4/etc. **Initial per-job authorization $8**, request one new explicit **$5** increment when the next paid operation would exceed available authorization. Each subsequent increment requires fresh explicit approval. Never execute another paid operation merely because budget remains. Zeus levels use smaller task-appropriate budgets and are not implicitly granted Olympus allowance.
- **Monthly $60 across all services is advisory only** during testing, not a hard stop; show gaps in unmetered media/provider charges.
- A firm $8/+5 policy requires database-enforced admission, usage reservation, job identity/owner verification and reconciliation. An estimated charge may exceed reality and timed-out requests may still be billable; no guarantee without provider-level safeguards.
- Idempotency keys, deadlines, rate limits, provider circuit breakers, no retry on invalid requests, bounded healthy fallback and cost reservation. Never loop blindly across failed upstream routes. Never claim a successful test/deploy without evidence.
- Netlify Gateway is primary where supported; OpenRouter fallback, then configured direct provider; API keys stay server-side. Netlify-only deploy, one tested GitHub main push per approved final release batch, not intermediate credit-burning pushes.

## Voice + UI

Separate Voice Message and Live Talk. ElevenLabs v4 Turbo TTS through Netlify/OpenRouter where supported; selected preset/custom Voice ID, browser TTS last resort. PT-BR/English/Spanish automatic transcription and code-switching; streaming-like continuous turn cycling, interrupt/resume, transcripts persisted to the same chat; selected voice consistent as internal models change.
Use original high-quality plasma Lightning orb as default with **fixed maximum diameter**; animated internal lightning and subtle space background, gentle brightness pulse, not expanding out of screen. 3 alternatives: Classic Orb, Olympus, Liquid Metal; pick in Settings. Honor reduced motion.
Shared personality and custom instructions across chat and Live Talk, project memory isolated. Premium responsive UI, multiline Enter, upload/photo/video/file support, readable Markdown, optional avatar and interactive previews. Avoid a flat lightning-logo replacement.

## Integrations / later Trace Lab

Google read-only OAuth now has local search and chat-context paths for Gmail snippets, Calendar events and Drive metadata; production OAuth/provider validation remains pending. Execution traces/provider outcomes/latency exist but dedicated Trace Lab interface can wait. Track metered speech/media/tool costs in unified ledger without falsely presenting partial totals as complete.

## Five implementation batches (no intermediate deployment)

1. **Foundation and staging (COMPLETE LOCALLY):** baseline CI assertion repair, zero-token chapter detection, pure adaptive planning and budget policy, regression tests, gap inventory, safe preservation of current main. Local tests and release gates pass; production publication is separate.
2. **Runtime execution + workspace (IN PROGRESS):** actual Level 3 three-role orchestration and personalized auto/manual policy; persistent project manifests, resumable phases, preview/approve/produce transitions; job-level budget reservation and $5 server-authenticated approval. Source file linking, revision history and completed-stage labels now have local implementation and tests; binary retrieval and live database validation remain.
3. **Speech and mobile presence (IN PROGRESS):** ElevenLabs and transcription reliability, multilingual Live Talk continuity, high-quality fixed-size animated Lightning orb plus avatar/voice settings, transcript and cost telemetry. Live Talk now resumes suspended mobile audio contexts and stop-to-submit is covered by regressions; physical-device and provider tests remain.
4. **Artifact production + Compare:** real interactive previews, actual generated documents, spreadsheets, presentations, images, UI and backend archives, A/B/Choose/Combine/Retry, cross-phase dependencies and testing.
5. **Integration and release:** Olympus visual/coding/assembly, provider resilience, Google read-only integrations, unified cost telemetry, full builds/tests/security/mobile checks, remove obsolete Vercel workflows if safely allowed, **single tested main update** and verify Netlify deployed behavior. Trace Lab UI is deferable.

**Release acceptance**: functional role routing and phase checkpoints, immutable original versions, all media/voice costs clearly labeled, no hidden charged classifier, paused work survives failures, user approvals enforced server-side, no fake availability, no unverified success claims.
