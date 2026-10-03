# OH-004.3.4 Polish Candidate — production smoke test

Run on the same Netlify environment where OH-004.2.7 / OH-004.2.5 worked. This deploy includes the additive Hard Fix 3 operations migration.

## 1. Authentication
- Sign in with the existing user.
- Reload the page.
- Confirm the session remains active.

## 2. Home chat
- Send `hello` in Zeus.
- Send a second message and verify the first remains in context.
- Switch to Olympus and send a simple analysis request.
- Confirm no opaque 502 appears.

## 3. Project permanence
- Open an existing Project.
- Confirm the page stays under Projects.
- Send a message in Zeus.
- Switch to Olympus and continue the same conversation.
- Leave the Project, return, and confirm history remains.
- Reload while inside the Project and confirm it reopens the same workspace.

## 4. Project tabs
- Open Chat, Overview, Tasks, Files and Memory.
- Confirm no tab redirects to Home.
- Confirm counts in Overview match the project data.

## 5. Project memory
- In Memory, add: `Preferred output language is Portuguese.`
- Return to Chat and ask what the preferred output language is.
- Confirm the saved memory is used.
- Delete that memory from the Memory tab and confirm it disappears.

## 6. Tasks
- Add a High-priority task with a due date.
- Mark it complete.
- Confirm project progress updates.

## 7. Project files
- From the Project Files tab upload a small TXT/PDF/ZIP file under 4 MB.
- Confirm it appears inside the Project Files list.
- Return to Chat and ask Zeus to summarize/analyze it.

## 8. Artifacts
Ask for each of the following at least once:
- PDF
- ZIP containing small source files
- XLSX or CSV

Confirm each output shows **Open** and **Download** and appears in Project Files / global Files.

## 9. Voice
- On iPhone, tap the microphone.
- Grant permission.
- Speak a short request.
- Confirm recognized text is submitted or a truthful unsupported/permission message is shown.

## 10. UI regression
- Mobile header must not show an extra conversation `...` menu.
- Bottom navigation must remain usable.
- Project tabs must horizontally scroll on narrow screens.
- No fake `2s / 4s / 15s` execution timings should appear.

## Rollback
If a core runtime regression appears, redeploy **OH-004.2.5 FULL RECOVERY**, which is the baseline for this finish pass.


## 11. Hard Fix 1 — canonical Project conversation
- Open one Project and note its conversation/history.
- Reload and reopen the Project several times.
- Confirm the same conversation continues and no duplicate workspace appears.

## 12. Hard Fix 1 — idempotent Retry
- Trigger a controlled model failure if possible, then tap Retry once.
- Confirm the failed user prompt does not appear twice after reload.
- Confirm the retry keeps one logical execution/request reference.

## 13. Hard Fix 1 — lifecycle integrity
- Set a Project to PAUSED.
- Add or complete a task.
- Confirm progress changes while Project status remains PAUSED.

## 14. Hard Fix 1 — partial Project edit
- Change only Project name/status from the UI.
- Confirm goal and description are not blanked/reset.

## 15. Hard Fix 1 — relationship guard
- Normal Project file upload and artifact generation must still work.
- A Project conversation/file from another Project must not be accepted if manually submitted through the API.

## Rollback note for 4.2.8
Redeploy OH-004.2.7 if a code regression appears. The 4.2.8 migration is additive/backward-compatible for normal operation, but Project deletion semantics remain cascade after the migration is applied.

## 16. Hard Fix 2 — intent routing
- Attach a ZIP and ask: `Analise este ZIP e me diga os problemas.` Confirm OlyHub analyzes it and does **not** generate a new ZIP.
- Ask: `Crie uma imagem de Zeus.` Confirm image generation starts.
- Attach an image and ask: `O que tem no background desta imagem?` Confirm OlyHub analyzes the image and does **not** enter image-edit mode.
- With that image attached, ask: `Edite essa imagem e melhore o fundo.` Confirm a new edited-image artifact is produced.
- Ask: `Crie uma apresentação para investidores.` Confirm a PPTX artifact is produced after the model response.

## 17. Hard Fix 2 — current attachment priority
- In a Project with several existing files/history, attach a new small TXT/MD/ZIP source file.
- Ask about a unique string that exists only in the newly attached file.
- Confirm the answer uses that current attachment rather than ignoring it in favor of older Project context.

## 18. Hard Fix 2 — secret scrubber
- Upload a test ZIP containing a fake `.env` with a fake token such as `OPENAI_API_KEY=sk-test-not-real-123456789` plus a normal README.
- Ask OlyHub to analyze the ZIP.
- Confirm it can discuss the README but does not echo the fake credential value. The `.env` should be reported/treated as omitted sensitive context.

## 19. Hard Fix 2 — vision
- Attach a PNG/JPEG/WebP screenshot and ask a concrete visual question whose answer is not present in the filename.
- Confirm OlyHub describes the actual image content.
- If the provider cannot accept vision, confirm the request fails clearly rather than pretending it saw the image.

## 20. Hard Fix 2 — bounded Olympus/runtime
- Send one moderately complex Olympus request.
- Confirm it completes or fails before the Netlify synchronous Function wall-clock limit rather than timing out after impossible fallback chains.
- Repeat after a provider quota/rate-limit failure if available; subsequent requests should skip repeatedly failing providers within the warm runtime and continue to a healthy fallback.

## Rollback note for 4.2.9
OH-004.2.9 adds no database migration. If this AI-runtime pass regresses production behavior, redeploy **OH-004.2.8 HARD FIX 1** without a schema rollback.


## 11. Pagination
- In a conversation with more than 60 messages, reopen it and confirm the newest page loads first.
- Tap **Load older messages** and confirm older messages prepend without duplicates.
- In Files / a Project with more than 60 outputs, confirm **Load older** retrieves the next cursor page.

## 12. Archive safety
- Upload a normal small ZIP and confirm it can be analyzed.
- Confirm a malformed/encrypted/extreme-expansion ZIP is rejected with a controlled 4xx archive error rather than a 500 or function crash.
- Ask OlyHub for a ZIP project and confirm the archive contains real files, not only README.md.

## 13. Concurrency and retry
- Start an Olympus request and immediately attempt a second Olympus request from another tab/session.
- Confirm the second request receives a controlled concurrency-limit response instead of launching another expensive council.
- Retry a failed request using the UI and confirm it still reuses the original request id.

## 14. Storage cleanup
- Create a Project with at least one upload and one generated artifact.
- Delete the Project.
- Call `/api/storage-maintenance` with POST while authenticated (or use a temporary diagnostic client) and confirm pending GC drains or is reported without corrupting other Projects.

## OH-004.3.0 UI refinement smoke pass
1. Desktop: confirm the sidebar remains fixed, current workspace context is visible in the top bar, and the centered OlyHub brand does not overlap controls.
2. Home: switch Zeus/Olympus, send a message, attach a file, trigger Retry on a controlled failure, and verify the floating composer never covers the newest message.
3. Projects index: verify cards show status/progress/counts, open with mouse/tap, and open with Enter/Space from keyboard focus.
4. Project workspace: visit Chat / Overview / Tasks / Files / Memory and confirm all existing actions still work.
5. Tools: enabled tools open their prompt flow; unsupported tools are disabled and do not trigger navigation.
6. Files: verify long filenames truncate cleanly and download controls remain reachable on phone width.
7. Settings: verify provider/capability diagnostics remain readable at desktop and phone widths.
8. Mobile: confirm header + bottom navigation, Project tabs, composer, safe-area padding and drawer do not overlap content.
9. Accessibility: tab through primary controls and confirm visible focus; with reduced-motion enabled, transitions/animations should become effectively instant.


## OH-004.3.1 Final Fix 1/3

1. Open a Project, switch to Files, then back to Projects. Confirm Project Files/Artifacts are still the Project-scoped set.
2. Open a Project conversation from recent chat history. Confirm Tasks, Memory, Files and Artifacts match that Project.
3. In global Files, delete one uploaded file and one generated artifact. Reload and confirm both remain deleted.
4. In a Project, delete an output and confirm Project counts update after reload.
5. Edit a Project and use Delete Project. Confirm the Project, permanent chat, tasks, memory, files and artifacts no longer appear.
6. Attempt an intentionally huge PPTX/XLSX artifact payload. Confirm the API returns a controlled 413-style artifact limit error instead of exhausting the Function.
7. Disable/unconfigure chat providers and confirm Documents is not shown READY.
8. Upload `.xlsx` and confirm spreadsheet text extraction still works. Upload legacy `.xls` and confirm OlyHub asks for `.xlsx`/`.csv` rather than pretending it parsed it.


## OH-004.3.2 Final Fix 2/3

21. Force the first Zeus provider attempt to fail on a complex request and confirm Zeus still returns a reviewed/integrated result when another model and budget remain.
22. Run a complex Olympus request and confirm the Director still synthesizes a canonical answer instead of falling back solely because specialists consumed the wall-clock budget.
23. Save more than 40 approved Project memories, including an older explicit instruction; confirm the Memory UI explains the policy and the explicit instruction remains eligible ahead of lower-priority notes.
24. Open Settings before any AI call and confirm providers show CONFIGURED UNVERIFIED rather than READY; after a successful execution, reload Settings and confirm the used provider can show OBSERVED HEALTHY from persisted execution evidence.
25. Create a queued Blob cleanup item by forcing a delete cleanup failure, then reload the app/health after the retry backoff and confirm the queue advances without manually invoking maintenance.
26. Request an invalid/missing file and artifact download and confirm the JSON error includes `code` and `requestId`; successful downloads should include `X-OlyHub-Request-Id`.

## OH-004.3.3 Final Fix 3/3

27. Sign in, reload the same tab, and confirm the session refreshes. Close the tab/browser session and confirm OlyHub requires authentication again rather than relying on a persistent localStorage token.
28. Generate a PDF containing Portuguese accents, smart quotes/dashes, a very long URL/token, emoji, and one unsupported non-Latin glyph. Confirm generation succeeds, supported text remains readable, long text wraps, and unsupported glyphs degrade safely rather than crashing the function.
29. Create a task and click its state control three times. Confirm it moves TODO → IN PROGRESS → DONE → TODO, while Project progress only counts DONE tasks.
30. Open New Project and Edit Project dialogs using keyboard navigation. Confirm focus enters the dialog, Tab stays within it, Escape closes it, and focus returns to the launcher control.
31. Run `npm ci`, `npm test`, and `npm run build` under Node 22. Confirm `package-lock.json` is present, lockfileVersion is 3, and its root dependencies exactly match the pinned `package.json`.


## 4.3.4 executable smoke gate
Before release, run the repository smoke harness against the actual production candidate. This is different from the local static/unit verifier.

Read-only Identity + health + Database read:
```sh
OLYHUB_SMOKE_BASE_URL=https://your-site.netlify.app \
OLYHUB_SMOKE_EMAIL=you@example.com \
OLYHUB_SMOKE_PASSWORD='...' \
npm run smoke:live
```

Full Project/Blob lifecycle:
```sh
OLYHUB_SMOKE_WRITE=1 npm run smoke:live
```

Full lifecycle plus one real Zeus turn grounded in an uploaded smoke source:
```sh
OLYHUB_SMOKE_WRITE=1 OLYHUB_SMOKE_AI=1 npm run smoke:live
```

A successful full smoke must prove: Identity login, health endpoint, Database read/write, canonical Project conversation, Blob upload/extraction, Project-scoped file retrieval, optional Zeus attachment grounding, and Project cascade/cleanup.
