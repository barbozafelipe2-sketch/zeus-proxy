# Final Fix 2/3 — Intelligence, memory, diagnostics, and runtime recovery

This pass closes the second group of findings from the final OlyHub audit plus the external Zeus/Olympus code review.

## Intelligence fixes

- Zeus no longer disables its specialist review just because the lead needed a provider/model fallback first. A complex request can still receive bounded review and integration when call/time budget remains.
- Failed lead candidates are excluded from the review selection so the reviewer does not immediately retry the same failed model entry.
- Olympus now protects an explicit wall-clock reserve for the Director. Primary specialists and the optional critic receive provider timeouts that preserve the final synthesis window instead of consuming the entire request deadline.
- Provider diversity is now a quality-bounded preference: Olympus uses a different provider when its score is close enough to the strongest candidate, but does not choose a materially weaker model solely for diversity.
- UI/UX work is no longer hard-wired to a writing-only model role. With visual inputs it prefers multimodal capability; otherwise it routes as reasoning/design work.

## Memory policy

- Project memory selection is now deterministic and shared in `_shared/memory.mjs`.
- The API may retain/show up to 200 approved memories, but each AI turn selects at most 40 within a 15k-character memory budget.
- Ranking is explicit: type priority, confidence, then recency. Explicit instructions outrank ordinary manual notes.
- Normalized duplicate memory content is collapsed before context assembly.
- The Project Memory UI now explains the actual context policy instead of implying that every saved item is always injected in full.

## Runtime diagnostics and cleanup

- Provider diagnostics now combine configured state with persisted execution evidence from the last 24 hours. Settings distinguishes NOT CONFIGURED, CONFIGURED UNVERIFIED, OBSERVED HEALTHY, RECENT FAILURE, and runtime DEGRADED states.
- Capability labels no longer claim READY solely because an environment variable exists. Unproven AI capabilities show CONFIGURED until actual evidence exists.
- Normal authenticated health/bootstrap checks opportunistically advance the durable Blob garbage-collection queue, so failed cleanup no longer depends exclusively on manually calling the maintenance endpoint.
- Blob GC retry attempts are bounded and back off between failures.
- File and artifact downloads now use the same request/correlation IDs, structured error codes, and top-level runtime shields as the rest of the API. Successful downloads also return `X-OlyHub-Request-Id`.

## Database safety

No database migration was added in this pass. Provider evidence is derived from the existing `executions` records, and automatic storage cleanup uses the existing Hard Fix 3 GC queue.

## Deferred to Final Fix 3/3

Auth/session storage hardening that can be done without breaking the working Netlify Identity flow, PDF Unicode/layout hardening, task lifecycle UX (`IN_PROGRESS`), modal/focus accessibility, package-lock/deploy reproducibility if registry access is available, final end-to-end smoke gates, and final release packaging/polish remain for the last fix pass.
