# OlyHub — Zeus Proxy

**Version:** OH-004.3.4 Personal Recovery

OlyHub is Felipe's private Netlify workspace. “Zeus Proxy” remains the repository and legacy API name.

## Current architecture

- **Poseidon Text and Poseidon Voice** are the shared OlyHub Core coordinator. They use the same project context, approved memory, permissions and tool catalog, then delegate eligible work to the appropriate specialist.
- The coordinator candidate defaults to **`x-ai/grok-4.3`** through the configured OpenRouter route, normally the Netlify AI Gateway. Backend routing may fall back when a provider is unavailable. The repository does not establish live credential availability, current provider pricing, or production behavior.
- The specialist filter keeps xAI out of tool execution so the coordinator does not take over a task assigned to a dedicated tool.
- Canonical specialist roles are Athena (research/knowledge), Hefesto (engineering/code), Apollo (visuals/images), Dionísio (audio/video), Peitho (marketing/acquisition), Deméter (commerce/business), Hermes (communications), and Hades (security). The current catalog connects Athena research/documents, Hefesto code, and Apollo images. Hermes exposes read-only Google integrations through Settings and Poseidon chat. The other dedicated Realms are planned, not active tools.
- Héstia (review) and Mnemosine (memory) are internal capabilities, not separate user-facing Realms. Source analysis and memory features remain available through OlyHub Core where configured.
- **Zeus** is the planned director/auditor surface. Its current UI is a shell; an independent evidence pipeline for executions, costs, failures and approvals, plus synchronous blocking of critical actions, is not implemented.
- The user interface has no Zeus Levels or Zeus/Olympus mode selector. Internal compatibility names may remain in APIs, storage and orchestration code.
- **Athena** is the shared Live Talk identity. OpenAI Realtime is the default; ElevenLabs Realtime is selectable. Both use Poseidon context. Gemini Live is not offered in the Live Talk UI.

The local repository state and the GitHub remote can differ. A passing local build or test suite does not mean a change has been pushed or deployed; live provider and Netlify verification are separate.

## Personal access

The app is a single-owner personal workspace and does not use a shared API access token or unlock screen. Every API route resolves to the same persistent owner; Functions do not independently authenticate a Netlify SSO identity. The current Netlify site requires SSO for all deploys, and that protection is part of the security boundary: keep it enabled for production, preview/branch deploys, and every alternate hostname. Do not expose the site or enable Drive writes on an unprotected URL. Provider credentials remain server-side.

## Code Agent

Code Agent queues repository requests, reads the selected GitHub branch, creates a roadmap, and waits for explicit approval. After approval it applies the roadmap phases to durable Netlify Blobs snapshots, reports phase progress, verifies the finished workspace, then publishes all changes in one GitHub commit. New requests remain queued while a job is executing. The worker does not expose its GitHub token to the browser.

Set `GITHUB_TOKEN` with **Functions** scope in Netlify. Give it Contents read/write access to the repositories Code Agent should use and Actions write access to the OlyHub test repository (`barbozafelipe2-sketch/zeus-proxy`) so it can dispatch the sandbox workflow. Code Agent can use every repository this token can access, so the Netlify site must be protected with visitor access controls: the app has no per-person login and its APIs resolve to the single owner. The older ZIP commit action still uses `GITHUB_REPO_ALLOWLIST`; Code Agent does not require that variable.

The background worker sends the final workspace snapshot to the `OlyHub Code Agent Sandbox` GitHub Actions workflow. A trusted preparation job retrieves it using GitHub OIDC; a separate job installs Node dependencies with lifecycle scripts disabled, then runs the repository's `test`, `release:check`, `build`, `lint`, and `typecheck` scripts inside a resource-limited Docker container with networking disabled and no GitHub permissions. The current verifier supports Node.js repositories with at least one of those scripts. Unsupported projects or failed checks stop the job before any commit. A passing workspace is pushed as one commit; branch-head conflicts and credential-like content also block the commit. Dependency installation and Docker image download happen outside the offline test container, without provider credentials or the GitHub token.

## Projects and tools

The interface calls these workspaces **Projects**. Each project keeps its own permanent chat, memory, sources, tasks and artifacts. **Home** includes project shortcuts and a project list. API routes use `/api/projects`.

Poseidon uses the backend routing policy and the dedicated-tool catalog; users do not select internal execution levels or an Olympus mode. Bounded concurrency, provider quotas, budget reservations and required action approvals remain. Provider keys stay server-side.

## Chat and voice behavior

Text chat, voice messages and Live Talk share OlyHub context and personalization. Ordinary conversation does not trigger project inspection, tool calls or unsolicited work offers. Poseidon routes explicit work through the backend policy and eligible specialist tools. Live Talk restores a bounded recent transcript and relevant open-project context. OpenAI Realtime is the default voice transport; ElevenLabs Realtime is an alternative. Google lookups in chat are read-only; Drive document publishing requires the separate project review-and-confirm flow. GitHub changes require the dedicated explicit action flow.

## Google integrations

Settings can connect Gmail, Calendar and Drive separately. Connected services can be searched in Settings and explicitly requested in chat; chat requests load a bounded result set into context. Gmail returns up to 10 message headers/snippets, Calendar up to 20 events from a maximum 31-day window (default: the next 7 days), and Drive up to 20 file metadata records per page. These chat integrations are read-only. A separate Drive writer can create a new Google Doc from a project summary only after the owner reviews the saved draft and confirms creation in the project UI; it never edits or deletes existing Drive files. OAuth access and refresh tokens are encrypted server-side with AES-256-GCM.

Google reads from Settings and chat share a per-owner hourly safety limit of 60 requests by default. Set `OLYHUB_GOOGLE_READ_HOURLY_LIMIT` in Netlify Functions to adjust it; the limit is enforced atomically in the database before refreshing tokens or querying Google.

To enable Google access, enable the Gmail API, Google Calendar API and Google Drive API in a Google Cloud project. Create a **Web application** OAuth client and set its authorized redirect URI to the exact app origin plus `/api/google-integration/callback`. Add these environment variables with **Functions** scope in Netlify:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` — exact HTTPS callback URI
- `GOOGLE_OAUTH_ENCRYPTION_KEY` — 32 random bytes encoded as 64 hexadecimal characters

Drive document publishing uses a separate Google connection with the `drive.file` scope. It is disabled unless `OLYHUB_DRIVE_WRITES_ENABLED=1` is set for Netlify Functions. Apply the `20261107090000_project_continuity` database migration before enabling the feature. The owner must review the full generated draft and explicitly confirm it in the project UI; chat, automated summaries, and GET requests cannot publish documents. See [the continuity and Drive publishing guide](docs/PROJECT_CONTINUITY_DRIVE.md) for the complete flow and production checks.

For a private personal app, add the account as an OAuth test user while the consent screen is in Testing. Google currently expires test-user authorizations after seven days for scopes beyond basic profile access; Gmail read access also requires restricted-scope verification if the app is offered publicly. Reconnect the relevant service when Google reports authorization expired. See the Google Cloud OAuth consent screen and Gmail scope verification requirements before changing the app's audience.
