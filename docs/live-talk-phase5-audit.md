# Live Talk phase 5 release audit (2026-11-06)

> Historical snapshot. Gemini Live was selectable in this build but is no longer offered in Poseidon Voice. The current provider policy is OpenAI Realtime by default, with ElevenLabs Realtime as the alternative. The security and production findings below describe the state examined on 2026-11-06 and must not be treated as current live verification.

## Changes validated in code
- ElevenLabs, Gemini Live and OpenAI Realtime remain selectable; Muse remains disabled.
- The OpenAI Realtime browser WebRTC exchange with an ephemeral client secret sends raw application/sdp.
- Gemini Live uses a server-minted ephemeral token and transcript buffering.
- ElevenLabs maintains iOS WebSocket and desktop WebRTC support.
- Primary read-aloud routes require explicit OpenAI/Gemini Gateway URL configuration. OpenRouter remains the authorized server-side TTS fallback.
- No manual Netlify deployment was requested or triggered directly by this workflow.

## Release status: BLOCKED — verify authentication before deploying
The current netlify/functions/_shared/auth.mjs returns a constant zeus-personal-owner for every caller and does not authenticate incoming requests. Without independently verified edge protection of ALL frontend and /api/* routes, any visitor could access private owner data and request paid voice credentials. This must be resolved before public deployment.

Required before enabling production: real owner authentication and ownership checks across API routes OR verified site-wide edge access control that protects functions; tests for unauthorized, expired and replayed credentials; iOS Safari and desktop smoke tests for all three voice providers; CSP, billing and model availability checks against a real deployment. Mock tests do not prove live voice session success.

OpenRouter TTS is an explicit authorized fallback, not a primary provider bypass. Realtime vendor endpoints require direct ephemeral voice connections and are distinct from normal Netlify text model Gateway routing. GitHub main pushes may trigger independently configured hosting integrations; no manual deploy was performed by the audit.
