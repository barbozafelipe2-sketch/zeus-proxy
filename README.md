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

Zeus picks the execution mode. Ordinary and single-skill requests stay on one model. A request that crosses several kinds of work, or an explicit ask for the team, runs Olympus in the background. The top of the chat shows which mode is in use.

Simple replies prefer Gemini Flash. Coding prefers DeepSeek, writing and hard work prefer Claude, research prefers Grok. GPT models are fallbacks, not the default. A fatal error (auth, billing, rate limit, bad request) skips the rest of that provider and tries the next one. Transient failures and missing model ids still walk the route.

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
