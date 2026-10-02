# Olympus Hub / Zeus Proxy — OH-001.2.1 Netlify Gateway Closure

OH-001.2 closes the user-facing shells that were present in the personal Zeus Proxy: every model call runs through Netlify AI Gateway, Zeus can select an available gateway engine, Olympus runs a bounded lead/review/director council, text attachments are analyzed as untrusted data, conversations survive reloads in this browser, and assistant answers can be downloaded as Markdown artifacts.

## What is implemented
- Direct OpenAI / Claude / Gemini modes behind a shared adapter contract. A failed Claude or Gemini call falls back to OpenAI when Netlify AI Gateway provides the OpenAI runtime configuration.
- Zeus selects the first gateway-configured provider in `ZEUS_PROVIDER_ORDER`, then OpenAI; default order is OpenAI, Claude, Gemini.
- Olympus runs one lead, blind parallel reviews from other configured providers, and a director synthesis. Missing or failed reviewers are recorded; if no review completes, the lead answer is returned and the trace marks degraded mode.
- Multi-turn conversation history: up to the most recent 20 stored messages are loaded for the same conversation/project and sent to the selected provider.
- Supported text attachments: `.txt`, `.md`, `.csv`, `.json`, `.tsv`; 100 KB per file, 10 files maximum, 60,000 combined characters. Attachments are included as clearly delimited, untrusted text in the provider request and server conversation history; they are not uploaded to object storage.
- Browser-local session continuity for visible messages, mode, and conversation ID. The new-conversation control clears the active session.
- One-click Markdown download for every assistant answer.
- Explicit execution state machine; terminal states cannot bypass transition validation.
- `requestId` is mandatory. The database reserves it before provider execution so duplicate/concurrent requests cannot both spend provider tokens. Completed duplicates replay the saved result; an in-flight duplicate returns HTTP 409.
- Provider calls receive an AbortSignal and are aborted on timeout.
- Atomic completed-turn persistence: conversation + user message + assistant message + reserved execution trace are committed together.
- Failure traces are updated best-effort. Persistence failures also emit structured server-side audit logging because a database outage cannot honestly guarantee a database trace.
- RLS enabled on all application tables with no client policies yet (fail closed). Server service-role access remains server-only.
- Provider-reported model/usage captured when exposed by the SDK; Gemini usage metadata is captured when available.
- Attachment contents are treated as untrusted input; the server validates file extensions and size before sending them to providers.
- Pinned dependency versions and a committed lockfile.
- Provider SDKs use Netlify-injected API keys and gateway base URLs. No provider credentials belong in `.env` files or user setup.
- Behavioral core tests using Vitest.

## Limits still in this release
There is no sign-in or user ownership, so deploy only behind private access controls. Supabase end-user RLS policies are not configured. Browser-local transcript continuity is per browser; server persistence requires Supabase. Attachments are text-only and are not retained as separate files. Dollar costs are not estimated because provider pricing is not sourced from a verified pricing table. There is no circuit breaker, automatic retry, Challenge pass, long-term memory write gate, or general Capability Broker yet.

## Netlify AI Gateway setup
Enable AI Features for the Netlify team, and do not define your own `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `GEMINI_API_KEY`, or `GOOGLE_GEMINI_BASE_URL` values. Netlify injects gateway credentials and base URLs at runtime. The site must have at least one production deploy before the gateway activates. For local development, use the linked site's `netlify dev` runtime rather than plain `next dev`; no individual provider key setup is required. Netlify bills AI Gateway usage against the site's credit balance.

## Reliability gate
Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`. Database behavior (RLS, reservation concurrency, atomic RPCs) must also be integration-tested against a Supabase test project before public exposure.

## Database migration
Apply `supabase/schema.sql` to the target Supabase project. The migration enables RLS, adds `reserve_request`, bounded history retrieval, and atomic completed-turn persistence. Server service-role access remains server-only. Do not expose this unauthenticated release publicly.
