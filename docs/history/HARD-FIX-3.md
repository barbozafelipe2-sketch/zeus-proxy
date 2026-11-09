# OH-004.2.10 — Hard Fix 3/3

This pass closes the operational foundation work identified in Hard Audit 3 while preserving the working 4.2.5/4.2.7 product baseline and the Hard Fix 1/2 repairs.

## Fixed in this pass

### Archive / decompression safety
- Added a ZIP central-directory preflight before JSZip/XLSX expands user-controlled ZIP/DOCX/PPTX/XLSX containers.
- Rejects excessive entry counts, excessive expanded size, oversized individual entries, suspicious compression ratios, encrypted archives, ZIP64, multi-disk ZIPs and unsupported compression methods.
- Generic source ZIP and Office-container budgets are separate so normal documents remain usable.

### Generated ZIP integrity
- Removed README-only success fallback.
- ZIP generation now requires explicit fenced file blocks with valid relative paths.
- Rejects traversal/absolute paths, duplicate paths and excessive output size.
- Re-inspects the generated ZIP, verifies that every expected file is present, and checks actual decompressed output against declared sizes before storage.

### Pagination / scale
- Chat history is cursor-paginated and initially loads the newest 60 messages.
- Files and artifacts are cursor-paginated and can be queried directly by Project.
- Project Files no longer depends on a global `LIMIT 200` window.
- UI exposes `Load older messages` and `Load older` output controls.

### Cost / concurrency protection
- AI execution initialization is serialized per owner with a Postgres advisory transaction lock.
- Zeus and Olympus have separate configurable hourly limits and concurrency caps.
- Retries with the same request ID bypass new-request quota consumption and continue to use the idempotency flow from Hard Fix 1.
- Upload, direct artifact generation, optional transcription and storage maintenance have durable per-user request-rate events.

Default safety limits (override with Netlify environment variables if needed):
- Zeus: 60 executions/hour, max 2 concurrent.
- Olympus: 20 executions/hour, max 1 concurrent.
- Upload: 120/hour.
- Direct artifact endpoint: 60/hour.
- Server transcription: 30/hour.
- Storage maintenance: 12/hour.

### Browser/runtime hardening
- Added a restrictive same-origin Content Security Policy (with inline styles allowed only because the current renderer still emits inline style attributes).
- Disabled camera/geolocation by policy while allowing microphone access for the existing voice path.
- Startup no longer silently swallows subsystem failures: partial bootstrap failures are surfaced to the user and logged for diagnosis.

### Blob cleanup / reconciliation
- Project deletion now queues every Project file/artifact Blob before relational cascade deletion.
- The queue is durable in Postgres and is drained after deletion on a best-effort basis.
- Failed upload/artifact cleanup can be queued instead of silently leaking storage.
- `/api/storage-maintenance` exposes authenticated queue draining plus a bounded recent-object DB-to-Blob health sample.

## Database
Adds one additive migration:
`20261001043000_hard-fix-3-operations`

It creates:
- `request_rate_events`
- `blob_gc_queue`

No prior migration is modified.

## Tests
`npm test` now includes `scripts/hardfix3-tests.mjs`, which exercises actual archive binary parsing, ZIP-output manifest validation, cursor encoding/pagination and AI concurrency/rate guard behavior with a Postgres-like client contract.

These tests materially improve runtime contract coverage but still do not replace a live Netlify production smoke test for Identity, Database, Blobs, provider billing, network latency or browser microphone behavior.
