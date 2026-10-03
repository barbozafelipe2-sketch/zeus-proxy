# Olympus Hub / Zeus Proxy — OH-001.2.2 Netlify Gateway Closure

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
- A production-only, server-checked private access key protects the chat endpoint; it is never embedded in the client bundle and is kept in session storage for the current browser tab.
- Behavioral core tests using Vitest.

## Limits still in this release
There is no account system or per-user ownership. This remains a personal deployment: set a unique `ZEUS_PROXY_ACCESS_TOKEN` of at least 32 characters and enable the hosting platform's private deployment protection. The app's shared access key protects provider spend, but it is not multi-user authentication or a substitute for platform access controls. Supabase end-user RLS policies are not configured. Browser-local transcript continuity is per browser; server persistence requires Supabase. Attachments are text-only and are not retained as separate files. Dollar costs are not estimated because provider pricing is not sourced from a verified pricing table. There is no circuit breaker, automatic retry, Challenge pass, long-term memory write gate, or general Capability Broker yet.

## Netlify AI Gateway setup
Enable AI Features for the Netlify team, and do not define your own `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `GEMINI_API_KEY`, or `GOOGLE_GEMINI_BASE_URL` values. The provider SDKs read Netlify's injected gateway credentials and base URLs at runtime, so there are no AI provider keys to create, paste, or rotate. The site must have at least one production deploy before the gateway activates. Netlify bills AI Gateway usage against the site's credit balance.

For local development, authenticate with Netlify and run `npm run netlify:link` once to link this checkout, then use `npm run dev`. That command runs Netlify Dev and injects the linked site's variables; `npm run dev:next` is only for UI work without Gateway access. The Netlify CLI is downloaded by `npx` on first use and pinned to version `27.10.2`.

**Deploy this build on Netlify.** Vercel will not inject Netlify AI Gateway credentials. Configure `ZEUS_PROXY_ACCESS_TOKEN` as a server-side Netlify environment variable. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are optional and only needed for server-side conversation persistence; without them, conversations remain in the browser. Keep the access token and service-role key out of `NEXT_PUBLIC_*` variables and source control. Save the access token in the app's private-access control after deployment. Enable Netlify's private site protection before sharing the URL.

## Reliability gate
Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`. Database behavior (RLS, reservation concurrency, atomic RPCs) must also be integration-tested against a Supabase test project before public exposure.

## Database migration
Apply `supabase/schema.sql` to the target Supabase project. The migration enables RLS, adds `reserve_request`, bounded history retrieval, atomic completed-turn persistence, and explicit `service_role` execute grants for the server RPCs. Server service-role access remains server-only. Require both the app access token and Netlify's private site protection before using the deployment.
