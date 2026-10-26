# Zeus Proxy — Personal Olympus Hub

**Version:** OH-004.3.4 Personal Recovery

Zeus Proxy is Felipe's private Netlify edition of Olympus Hub.

## Personal access

The app is a single-owner personal workspace and does not use a shared API access token or unlock screen. Every API route resolves to the same persistent owner. Protect the Netlify site itself with Netlify visitor access controls; provider credentials remain server-side.

## Code Agent

Code Agent queues repository requests, reads the selected GitHub branch, creates a roadmap, and waits for explicit approval. After approval it applies the roadmap phases to durable Netlify Blobs snapshots, reports phase progress, then publishes all changes in one GitHub commit. New requests remain queued while a job is executing. The worker does not expose its GitHub token to the browser.

Set `GITHUB_TOKEN` with **Functions** scope in Netlify. Give it Contents read/write access to the repositories Code Agent should use. Code Agent can use every repository this token can access, so the Netlify site must be protected with visitor access controls before this feature is deployed: the app has no per-person login and its APIs resolve to the single owner. The older ZIP commit action still uses `GITHUB_REPO_ALLOWLIST`; Code Agent does not require that variable.

The background worker generates code changes from the approved roadmap and commits them as a single tree update. It does not run repository shell scripts or tests; phase verification items are shown for review, not reported as executed. Branch-head conflicts and credential-like content block the commit.

## Zeus Levels

| Level | Internal | Typical tasks |
|------|----------|----------------|
| **1** | SIMPLE | Basic chat, translation, short answers |
| **2** | COMPOUND | Simple PDF/docs, logos, moderate code, **image generation** |
| **3** | ZEUS_DIRECTED | Advanced UI/frontend, isolated backend, complex reports, books |
| **Olympus** | multi-specialist | Full assemble: UI + code + integration, audits |

**Compare & Evolve** (Tools) and the **Like** button on replies record preferred model families per task type (`familyPreferences`).

## Projects + Manager

The interface calls these workspaces **Projects**. Each project keeps its own permanent chat, memory, sources, tasks and artifacts. **Home** includes project shortcuts and a project list. API routes use `/api/projects`.

A deterministic zero-token router chooses Zeus Level 1 / 2 / 3; Olympus is a multi-specialist mode. There is no hourly execution cap; bounded concurrency, provider quotas, explicit Olympus budget reservations and required action approvals remain. Provider keys stay server-side.

## Chat and voice behavior

Text chat, voice messages and Live Talk follow the same OlyHub procedures and selected user personalization. Ordinary conversation does not trigger project inspection, tools or unsolicited work offers. Direct work requests use the selected Zeus level or Olympus mode; project tools are reserved for project requests. Live Talk restores a bounded recent transcript and only a small, relevant slice of the open project's context to control prompt cost. Google integrations are read-only; GitHub changes require the dedicated explicit action flow.

## Google read-only integrations

Settings can connect Gmail, Calendar and Drive separately. Connected services can be searched in Settings and explicitly requested in chat; chat requests load a bounded result set into context. Gmail returns up to 10 message headers/snippets, Calendar up to 20 events from a maximum 31-day window (default: the next 7 days), and Drive up to 20 file metadata records per page. The app never writes to Google. OAuth access and refresh tokens are encrypted server-side with AES-256-GCM.

Google reads from Settings and chat share a per-owner hourly safety limit of 60 requests by default. Set `OLYHUB_GOOGLE_READ_HOURLY_LIMIT` in Netlify Functions to adjust it; the limit is enforced atomically in the database before refreshing tokens or querying Google.

To enable Google access, enable the Gmail API, Google Calendar API and Google Drive API in a Google Cloud project. Create a **Web application** OAuth client and set its authorized redirect URI to the exact app origin plus `/api/google-integration/callback`. Add these environment variables with **Functions** scope in Netlify:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` — exact HTTPS callback URI
- `GOOGLE_OAUTH_ENCRYPTION_KEY` — 32 random bytes encoded as 64 hexadecimal characters

For a private personal app, add the account as an OAuth test user while the consent screen is in Testing. Google currently expires test-user authorizations after seven days for scopes beyond basic profile access; Gmail read access also requires restricted-scope verification if the app is offered publicly. Reconnect the relevant service when Google reports authorization expired. See the Google Cloud OAuth consent screen and Gmail scope verification requirements before changing the app's audience.
