# OH-004.2.8 — Hard Fix 1/3

This release applies the first foundation repair pass to the working OH-004.2.7 baseline. It does not redesign the UI and it intentionally leaves the AI-router/context/time-budget work for Hard Fix 2/3.

## Fixed in this pass

### Canonical Project conversation
- Every Project is now protected by a partial unique index on `(owner_id, project_id)`.
- Legacy duplicate Project conversations are merged into the oldest canonical conversation during migration.
- Project chat creation uses `ON CONFLICT` so a lost client `conversationId` cannot silently create a second Project timeline.

### Project deletion semantics
- Deleting a Project now deletes its Project conversation/files/artifacts instead of converting them into Home data.
- Existing foundation migration remains byte-for-byte unchanged; behavior is changed only by the new additive migration.

### Idempotent turns and Retry
- Every chat turn uses a canonical request ID.
- `(owner_id, request_id)` is unique in `executions`.
- Retrying a failed request reuses the same execution/user message instead of inserting another copy.
- If a completed response was delivered but the client lost the network response, repeating the same request ID returns the completed result instead of charging/generating again.
- Reusing a request ID with different text, attachments, conversation, or intelligence mode is rejected.

### Transactional database finalization
- Assistant message, artifact DB rows, execution completion, and conversation timestamp now finalize inside one Postgres transaction.
- Artifact bytes are staged in Blob storage before DB finalization and removed on rollback/failure.
- Project creation + permanent Project conversation are committed together.

### Ownership / relationship integrity
- Files and artifacts now verify Project and Conversation ownership and their relationship before writing.
- Project chat attachments are rejected if they belong to another Project/Home scope.
- Project/Conversation mismatches return explicit 409 errors instead of creating inconsistent links.

### Safe Project and Task updates
- Project PATCH now preserves fields omitted by the client instead of resetting them.
- Invalid project status/progress returns 400.
- Task due dates are validated before reaching Postgres.
- Updating tasks no longer forces a PAUSED Project back to IN_PROGRESS.

### Correlation IDs
- Browser API requests send `X-OlyHub-Request-ID`.
- Chat retries preserve the same request ID.
- Core APIs return a request ID in controlled errors so UI references can map to the same logical request.

## Explicitly deferred to Hard Fix 2/3
- bilingual intent routing / analyze-vs-create separation
- current-attachment-first context budgeting
- secret redaction for source files / ZIPs
- global execution deadline
- Olympus call/cost budget
- provider circuit breaker/health
- real vision input

## Explicitly deferred to Hard Fix 3/3
- message pagination
- ZIP decompression budgets
- per-user rate/concurrency limits
- Blob garbage collection
- full Netlify integration/runtime test harness
