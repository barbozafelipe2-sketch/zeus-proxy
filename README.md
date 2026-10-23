# Zeus Proxy — Personal Olympus Hub

**Version:** OH-004.3.4 Personal Recovery

Zeus Proxy is Felipe's private Netlify edition of Olympus Hub.

## Personal access

The app is a single-owner personal workspace and does not use a shared API access token or unlock screen. Every API route resolves to the same persistent owner. Protect the Netlify site itself with Netlify visitor access controls if its contents must not be publicly reachable; provider credentials remain server-side.

## Zeus Levels

| Level | Internal | Typical tasks |
|------|----------|----------------|
| **1** | SIMPLE | Basic chat, translation, short answers |
| **2** | COMPOUND | Simple PDF/docs, logos, moderate code, **image generation** |
| **3** | ZEUS_DIRECTED | Advanced UI/frontend, isolated backend, complex reports, books |
| **Olympus** | multi-specialist | Full assemble: UI + code + integration, audits |

**Compare & Evolve** (Tools) and the **Like** button on replies record preferred model families per task type (`familyPreferences`).

## Agents + Manager

UI renames **Projects → Agents**. Each agent keeps an isolated permanent chat, memory, sources and artifacts. **Home** is the Manager with an agent chip strip. API routes remain `/api/projects` for compatibility.

A deterministic zero-token router chooses Zeus Level 1 / 2 / 3; Olympus is a single multi-specialist mode. Provider keys stay on Netlify AI Gateway.

## Google read-only integrations

Settings can connect Gmail, Calendar and Drive separately. Connected services can be searched in Settings and explicitly requested in chat; chat requests load a bounded result set into context. Gmail returns up to 10 message headers/snippets, Calendar up to 20 events from a maximum 31-day window (default: the next 7 days), and Drive up to 20 file metadata records per page. The app never writes to Google. OAuth access and refresh tokens are encrypted server-side with AES-256-GCM.

Google reads from Settings and chat share a per-owner hourly safety limit of 60 requests by default. Set `OLYHUB_GOOGLE_READ_HOURLY_LIMIT` in Netlify Functions to adjust it; the limit is enforced atomically in the database before refreshing tokens or querying Google.

To enable Google access, enable the Gmail API, Google Calendar API and Google Drive API in a Google Cloud project. Create a **Web application** OAuth client and set its authorized redirect URI to the exact app origin plus `/api/google-integration/callback`. Add these environment variables with **Functions** scope in Netlify:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` — exact HTTPS callback URI
- `GOOGLE_OAUTH_ENCRYPTION_KEY` — 32 random bytes encoded as 64 hexadecimal characters

For a private personal app, add the account as an OAuth test user while the consent screen is in Testing. Google currently expires test-user authorizations after seven days for scopes beyond basic profile access; Gmail read access also requires restricted-scope verification if the app is offered publicly. Reconnect the relevant service when Google reports authorization expired. See the Google Cloud OAuth consent screen and Gmail scope verification requirements before changing the app's audience.
