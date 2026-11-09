# OlyHub OH-004.3.4 — release smoke check

This checklist describes the current product. OlyHub is a single-owner workspace: there is no app sign-in screen and no Zeus/Olympus mode switch in the UI. The public repository and runtime checks cannot verify Netlify dashboard visitor-access settings.

## Before release

- In Netlify, verify visitor access for production, preview/branch deploys, and every alternate hostname. Keep every URL private; Functions resolve to the same personal owner and do not authenticate a visitor identity themselves.
- Confirm required database migrations are applied and the Function environment has the intended provider credentials. Do not treat `configured_unverified` as proof that a live call succeeded.
- Run `npm test`, `npm run release:check`, and `npm run build` on Node 22.

## Browser smoke check

1. Open the protected site and confirm the workspace loads without a login screen. In Settings, check database/provider readiness and confirm Netlify visitor access is shown as **VERIFY IN NETLIFY**, never as verified by the app.
2. Open the catalog. Confirm Zeus appears first and Poseidon second, all ten deity cards use their own portrait images without a separate icon placed over a face, and planned Realms are identified as plans rather than active tools.
3. Send a normal Poseidon chat message. Start a new conversation, reload, and confirm conversation history is still available.
4. Open an existing Project, send a message, then check its Overview, Tasks, Files, and Memory. Confirm the conversation and data remain scoped to that Project after reload.
5. Upload a small TXT/PDF/ZIP to a Project and ask Poseidon to analyze it. Confirm the answer uses the attached file. Generate a small artifact and verify Open/Download.
6. Open the Tools catalog. Athena research/documents, Hefesto code, and Apollo images should expose their current runtime model candidates. Blueprint model/skill plans must remain visibly distinct from active integrations; planned Realms must not claim an execution is available.
7. In Live Talk, switch among the available orb previews. Confirm the chosen visual changes, the frame/symbol stays still, and the voice screen does not display a fixed deity name. End the call and confirm the transcript returns to chat.
8. In Settings, change a read-aloud or Live Talk preference and reload. Confirm the selected setting persists in that browser.
9. Delete only the temporary Project and files created for this check. Confirm they disappear from the Project list and Files after reload.

## Live API smoke harness

The harness makes direct HTTP requests and has no mechanism to complete a Netlify visitor-access login. Use it only from an environment already authorized to reach the site. It supports read-only checks by default; write and paid-AI checks are opt-in:

```sh
ZEUS_PROXY_SMOKE_BASE_URL=https://your-site.netlify.app npm run smoke:live
```

```sh
ZEUS_PROXY_SMOKE_BASE_URL=https://your-site.netlify.app ZEUS_PROXY_SMOKE_WRITE=1 npm run smoke:live
```

```sh
ZEUS_PROXY_SMOKE_BASE_URL=https://your-site.netlify.app ZEUS_PROXY_SMOKE_WRITE=1 ZEUS_PROXY_SMOKE_AI=1 npm run smoke:live
```

The final command makes a real model call and can incur provider cost. The write harness creates then deletes a temporary Project. A green local check is not evidence of a successful production deploy or of Netlify visitor-access configuration.
