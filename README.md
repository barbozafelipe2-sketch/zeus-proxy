# Zeus Proxy — Personal Olympus Hub

**Version:** OH-004.3.4 Personal Recovery

Zeus Proxy is Felipe's private Netlify edition of Olympus Hub. It keeps the complete OlyHub workspace foundation while preserving the personal black/gold Zeus identity. The difference from commercial OlyHub is distribution and account scope, not a reduced feature set: **OlyHub = commercial/App Store; Zeus Proxy = private/Netlify/single-owner.**

## Product contract

Only **Zeus** and **Olympus** are user-facing AI modes. OpenAI, Anthropic, Gemini and other configured engines are internal implementation details.

The recovered workspace includes:
- Home conversation history without Project memory leakage.
- Projects with one canonical permanent conversation per Project.
- Dedicated approved Project memory, tasks, goal/progress state and long-history context.
- Private files, artifacts and output downloads.
- Image generation/editing and image/vision inputs where the configured capability supports them.
- Voice input with browser speech recognition and optional server transcription.
- Durable execution traces, rate/concurrency guards, Blob cleanup and Netlify Database persistence.
- Full Zeus and Olympus orchestration from the audited 4.3.4 foundation.
- Live web research through the OpenAI Responses `web_search` capability, with persistent clickable source citations.

## Personal access

Commercial Netlify Identity is not required by Zeus Proxy. Production access is protected server-side by `ZEUS_PROXY_ACCESS_TOKEN` (32+ characters), compared in constant time.

The browser persists the entered key in `localStorage` under `olyhub.zeusproxy.access.v3`, so the installed home-screen app and new tabs stay unlocked on the owner's device. It is sent as `x-zeus-access-token` on every private API call. Keys saved by older builds (`olyhub.zeusproxy.access.v2` in `localStorage` or `sessionStorage`) are migrated to the v3 key on first load and the legacy entries are removed. **Lock** (sidebar or Settings) and any `401` from the API clear every stored copy.

Because the key is persisted, treat a device that has unlocked Zeus as trusted; use **Lock** on shared devices. `scripts/verify.mjs` and `scripts/finalfix3-tests.mjs` enforce this contract (v3 key, written with `localStorage.setItem`, never with `sessionStorage.setItem`).

Do not expose the access token through client-visible environment variables.

## Netlify AI Gateway

Provider API keys/base URLs are expected to be supplied by Netlify AI Gateway. Do not add manual provider keys unless intentionally overriding the gateway. Explicit/current-information requests can use the same Gateway-backed OpenAI Responses endpoint for live web research.

**Zeus or Olympus is chosen manually by the owner.** The server never spends an AI call deciding between them. A deterministic zero-token router chooses only the internal level: Zeus → Simple or Compound; Olympus → Compound Plus or Complex Turbo. Phase 1 locked this contract. Phase 2 installed Zeus Simple and Compound. Phase 3 installed Olympus Compound Plus. **Phase 4 replaces Complex Turbo with role-based orchestration:** Planner → up to 3 bounded Creators → an independently selected Director/Assembler from a different provider family → CEO/Final Authority. Roles are stable while providers are preferences with fallbacks. Turbo is hard-capped at 10 model calls and 3 creator workstreams; when independent Director separation cannot be preserved, it downgrades safely to Compound Plus instead of pretending Turbo succeeded.

Simple uses the normal cheapest/fastest route for the task. Compound reserves premium GPT for the final voice: the base stage follows the route but prefers models with cost score ≤3, then the Finisher role prefers strong GPT with fallbacks. Fatal provider errors skip that provider; transient/model-availability failures can advance the fallback chain. **Phase 5 adds deterministic budget/action gates:** Turbo estimates creator count, expected calls, token ceiling and runtime before execution; only higher-budget quotes require owner approval, bound to the exact request. External mutations are never implied by Turbo: GitHub commit requires its explicit action flow and confirmation, optional `GITHUB_REPO_ALLOWLIST` can restrict writable repositories, and deploy/merge/destructive production changes remain outside normal chat execution.

## UX invariants

- Navigation lives behind the top-bar **☰** menu button (the sidebar is always visible on desktop); it exposes Home, Projects, Tools, Files and Settings plus recent chats.
- The composer `+` opens **Photo / Video · Camera · File**.
- `Enter` adds a new line; the arrow (or `Ctrl/⌘ + Enter`) sends. An unsent draft survives re-renders.
- Project chat is permanent and receives its own memory/tasks/files context.
- Home chats remain outside Project memory and never inherit a Project's dedicated memory.

## Accessibility & resilience

- Landmarks, labelled controls, `aria-current` / `aria-pressed` / `aria-expanded` state, a skip link and a single polite live region for status and errors.
- Keyboard: visible focus ring, focus is preserved across re-renders, `Escape` closes the `+` menu, drawer and dialogs.
- Text colours meet WCAG AA contrast on app surfaces; `prefers-reduced-motion` is respected.
- Network failures, offline state and unreadable responses produce clear, dismissible messages; a thin progress bar shows in-flight requests.
- Safe-area insets are honoured for the iOS home-screen app and landscape notches.

## Security headers

`netlify.toml` sets a strict CSP (`script-src 'self'`, no third-party origins), HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `X-Content-Type-Options`. API responses are `no-store`. `index.html` is `noindex`.

## Validation

Requires Node 22.x / npm 10.9.x (`engine-strict` is on). Run before production deployment:

```sh
npm ci
npm test
npm run build
```

The recovery keeps the OH-004.3.4 hard/final-fix suites and adds `scripts/zeus-personal-tests.mjs` for the personal access, two-mode UI, Project continuity, attachment chooser and OpenAI fallback invariants, plus `scripts/a11y-polish-tests.mjs` for the accessibility, resilience, head-metadata and security-header invariants.

## Live smoke

Read-only private runtime smoke:

```sh
ZEUS_PROXY_SMOKE_BASE_URL=https://zeus-olyhub.netlify.app \
ZEUS_PROXY_SMOKE_ACCESS_TOKEN='your-32+-character-private-key' \
npm run smoke:live
```

Set `ZEUS_PROXY_SMOKE_WRITE=1` to test Project + Blob write/delete lifecycle. Add `ZEUS_PROXY_SMOKE_AI=1` only when you intentionally want to spend one real Zeus inference for provider + attachment-grounding verification.

## Database safety

The original foundation migration remains unchanged.

SHA-256: `90dece71adbd153d42168585fab6988e000fec715c33a6bef3595c2096a52d70`

The source line is the audited OlyHub OH-004.3.4 foundation with a personal Zeus overlay; it is no longer based on the reduced OH-001.2.x chat shell.


## GitHub commit integration

OlyHub can publish a validated ZIP project package to an existing GitHub repository with one atomic, non-force commit. GitHub writes run only on the server and require `GITHUB_TOKEN` with Contents read/write access to the target repository. The browser never receives the token. ZIP preflight blocks unsafe paths, private-key/.env-style files and credential-like text before creating Git blobs. Protected branches remain protected: OlyHub does not force-push.

## Stage 6/10 — Independent AI transport fallbacks (staged, not committed)

The primary path uses Netlify AI Gateway's injected provider credentials. Separate optional server-only `OPENROUTER_DIRECT_API_KEY` and `OPENAI_DIRECT_API_KEY` enable independent transport fallbacks, in that order, without adding new UI modes. The Router channel supports model families through OpenRouter; Director/Critic independence is evaluated by underlying model family rather than the word `openrouter`. Each outbound retry consumes an existing execution-budget call. An unavailable direct key is skipped, not counted as an available fallback. Source-only staging does not configure keys or verify a live endpoint; it does not change `main` or deploy.

## Stage 7/10 — AI transport observability and recovery (staged, not committed)

Model attempts are recorded within the existing call budget, including stage, adapter, model family, transport, outcome, elapsed milliseconds and safe failure category. No prompt, completion text, attachments, credentials, or raw provider errors are included in this provider telemetry. Success and failure traces are stored in the existing executions JSONB trace. Health now reports 24-hour per-transport evidence and counts when a direct backup recovered a Gateway failure; configured does not mean verified. Circuit breakers isolate Gateway from direct credentials, and their in-memory states are instance-local. The stage adds mocked failure/cooldown/redaction tests and does not trigger a model call, commit or deployment.

## Stage 8/10 — Extreme-failure safety and integration audit (staged, not committed)

Fixes a wasted-credit path: HTTP 413/422 or clear malformed-input HTTP 400 stop retries across providers, returning a sanitized AI_REQUEST_REJECTED error. Missing models (404), rate limits (429), transient failures and provider outages retain bounded fallback. Olympus and Turbo honor that terminal-input decision without spending further calls on a Zeus downgrade. The existing hard caps, family separation, approval gates and explicit external-mutation policy remain unchanged. Failed provider-chain execution traces store a categorized code instead of raw upstream error details. A nine-scenario synthetic suite covers success, invalid inputs, unavailable models, throttling, direct recovery and total outage. No production deploy, new credentials or real AI requests were performed for this stage.

## Stage 9/10 — Cross-mode regression audit (staged, not committed)

Audited baseline required-path inventory (62 required files present), production package-lock dependencies, module syntax, and model routing constraints. Fixed the Complex Turbo CEO candidate filter to exclude the Director's underlying model **family** even if the Director uses a different adapter (e.g. OpenRouter). Fixed Zeus Compound and Olympus Compound Plus labels and gptFinished indicators to reflect the actual finisher family instead of claiming GPT for non-OpenAI fallbacks. Added a regression suite covering deterministic role-family isolation, 40 routing combinations with hard caps and unique network paths, budget-bound four-stage transport recovery, existing Turbo budget/approval and request-idempotency invariants. The 9/10 staging tree has no commit and no deploy. Full npm test, npm build, and live Netlify/Supabase credential checks remain REQUIRED before release; synthetic V8 checks are not a substitute for executing the npm suite under Node.
