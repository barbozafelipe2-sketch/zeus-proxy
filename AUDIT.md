# OH-004.2.7 audit

## Verdict
PASS for source packaging and static regression checks. Live Netlify smoke testing is still required before calling the deploy production-stable.

## Preserved critical controls
- Permanent Project conversation remains under Projects, never redirected to Home.
- Project goal/tasks/files/approved memory/history remain injected into Project model context.
- Home and Project contexts remain separated.
- Server auth still uses Netlify Identity `getUser()`.
- Original foundation migration is unchanged.
- ZIP creation imports/uses JSZip and generic ZIP analysis remains enabled.
- Invalid `CREATING_ARTIFACT` state remains forbidden.
- No `db.sql(...).catch()` regression.
- OpenAI requests still omit unsupported `temperature`.
- Olympus → Zeus recovery remains present.

## Finish-pass controls
- Project workspace exposes Chat / Overview / Tasks / Files / Memory.
- Approved project memory is visible and manageable via `/api/memories`.
- Memory writes stay owner + project scoped.
- Project files and generated outputs are visible inside their project.
- Task priority and due date can be set at creation.
- Project details can be edited using the existing safe PATCH endpoint.
- Execution UI no longer invents completion timings.
- Artifact action labels are output-type neutral.

## Known boundaries
Static checks cannot prove live Netlify Identity, Database, Blobs, AI provider billing/availability, iOS microphone permissions, or provider latency. Use `SMOKE-TEST.md` on the actual deployed site.

## OH-004.2.9 Hard Fix 2/3 addendum
Hard Audit 2 findings addressed in this pass:
- bilingual deterministic intent routing;
- analyze/create/edit collision prevention;
- attachment-first context budget with relevance-ranked older files;
- sensitive-file omission and secret redaction before AI context;
- request-wide deadline/model-call budget;
- bounded Olympus team/cost surface;
- warm-runtime provider circuit breaker;
- real supported image inputs for model vision;
- explicit audio endpoint requirement for optional server transcription.

Deferred to Hard Fix 3: durable rate/concurrency controls, archive/ZIP resource budgets, pagination, blob reconciliation/garbage collection, structural ZIP validation and end-to-end Netlify integration testing.


## OH-004.2.10 Hard Fix 3/3 addendum
Hard Audit 3 operational findings addressed in this pass:
- bounded archive decompression before ZIP/Office extraction;
- generated ZIP structural validation with no README-only success path;
- cursor pagination for permanent chat history and Project/global files/artifacts;
- per-user AI concurrency and hourly safety guards;
- durable endpoint request-rate events;
- durable Blob garbage-collection queue around destructive Project operations and failed cleanup;
- authenticated storage reconciliation/maintenance endpoint;
- runtime-contract tests for archive, pagination, ZIP manifest and guard behavior.

Live Netlify smoke testing remains required before calling the deploy production-stable.
