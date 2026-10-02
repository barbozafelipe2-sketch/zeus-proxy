# Changelog
## OH-001.2.1 — Netlify AI Gateway
- Removed the expectation that Felipe supplies individual provider credentials.
- Provider adapters now require Netlify-injected gateway keys and gateway base URLs; SDK clients read the runtime configuration instead of receiving user-managed keys.
- OpenAI now uses the Chat Completions endpoint shown in Netlify's official AI Gateway integration examples.
- Set the default OpenAI model to a model listed by Netlify AI Gateway; retained the documented Claude and Gemini models.
- Removed empty provider credential fields from `.env.example` to prevent local overrides from bypassing Netlify's injected configuration.
- Updated the README with team AI Features, first-production-deploy, `netlify dev`, and credit-billing setup notes.

## OH-001.2 — Functional Core
- Zeus now selects a configured provider using `ZEUS_PROVIDER_ORDER`; OpenAI remains the final configured fallback.
- Direct Claude and Gemini modes fall back to OpenAI when their calls fail and OpenAI is configured; fallback is recorded in the trace.
- Added a bounded Olympus council: one lead, blind reviews by other configured providers, and a director synthesis. Unavailable reviewers are surfaced in the trace.
- Enabled text attachments for `.txt`, `.md`, `.csv`, `.json`, and `.tsv`, with per-file and combined-size limits and explicit untrusted-input treatment.
- Added browser-local session continuity and a working new-conversation control.
- Added one-click Markdown answer downloads.
- Updated tests and release notes to state the remaining auth, RLS ownership, storage, retry, memory, and pricing limits.
- Updated Next.js and Vitest to patched versions after dependency audit; full audit reports zero vulnerabilities.

## OH-001.1 — Reliability Closure
- Added real bounded multi-turn history.
- Replaced terminal-state bypass with validated `finish()` transitions.
- Added pre-execution request reservation for concurrent-safe idempotency.
- Added real provider cancellation through AbortSignal.
- Enabled RLS fail-closed on all application tables.
- Added structured persistence-failure server audit fallback.
- Added provider error taxonomy and non-timeout HTTP mapping.
- Captures provider-reported model and Gemini usage where available.
- Removed client-controlled attachment trust.
- Made requestId mandatory; UI generates one for every send and handles replay/persistence warnings.
- Replaced source-string tests with behavioral Vitest tests.
- Pinned package versions.

### Rollback
Keep the prior `Olympus_Hub_OH-001.1_Reliability_Closure_RC.zip`. Roll back application and database together if an OH-001.2 schema change is introduced and rejected. This release uses the existing OH-001.1 schema; do not run without its reservation/history RPCs if Supabase is configured.
