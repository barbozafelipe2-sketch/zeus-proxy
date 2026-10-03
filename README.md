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

Commercial Netlify Identity is not required by Zeus Proxy. Production access is protected server-side by `ZEUS_PROXY_ACCESS_TOKEN` (32+ characters). The browser stores the entered key only in `sessionStorage` for the current tab/session and sends it as `x-zeus-access-token` to the private API.

Do not expose the access token through client-visible environment variables.

## Netlify AI Gateway

Provider API keys/base URLs are expected to be supplied by Netlify AI Gateway. Do not add manual provider keys unless intentionally overriding the gateway. Explicit/current-information requests can use the same Gateway-backed OpenAI Responses endpoint for live web research.

### Anti-failure model policy

OpenAI is not a single-model point of failure. Zeus uses a bounded same-provider OpenAI chain; an unavailable OpenAI model can advance to another compatible OpenAI model. A selected Claude/Gemini route can fall into the OpenAI chain when appropriate. OpenAI itself does **not** silently jump to Claude/Gemini.

Retries are intentionally blocked for authentication, billing/quota, rate-limit, invalid-request, context-length and content-policy failures so the app does not burn credits repeating a request that cannot succeed.

## UX invariants

- Top navigation exposes Projects/workspace navigation through the three-dot control.
- The composer `+` opens **Photo / Image · Video · File**.
- `Enter` adds a new line; the arrow sends.
- Project chat is permanent and receives its own memory/tasks/files context.
- Home chats remain outside Project memory and never inherit a Project's dedicated memory.

## Validation

Run before production deployment:

```sh
npm ci
npm test
npm run build
```

The recovery keeps the OH-004.3.4 hard/final-fix suites and adds `scripts/zeus-personal-tests.mjs` for the personal access, two-mode UI, Project continuity, attachment chooser and OpenAI fallback invariants.

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
