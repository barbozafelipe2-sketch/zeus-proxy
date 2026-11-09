# Final Fix 3/3 — OH-004.3.3

This pass closes the last pre-polish issues found in the final audit and external review without changing the OlyHub product architecture or database schema.

## Session hardening

The previous browser client persisted the full Netlify Identity token payload in `localStorage`. OH-004.3.3 keeps the access token in JavaScript memory only and stores only the refresh token in `sessionStorage`, scoped to the browser tab/session. Existing `olyhub_auth_v4` localStorage data is migrated once and removed. Identity fetches and Identity CDN routes are marked `no-store`.

This reduces persistent token exposure while preserving the existing Netlify Identity backend contract. It is not equivalent to an HttpOnly server session: active-page XSS could still access in-memory/sessionStorage state, so CSP remains an important control.

## PDF safety

PDF output still uses pdf-lib StandardFonts and therefore does not claim arbitrary Unicode coverage. The renderer now:
- normalizes common smart punctuation,
- preserves glyphs the embedded StandardFont can encode,
- replaces unsupported text safely instead of throwing,
- represents unsupported emoji as `[emoji]`,
- wraps by measured glyph width rather than character count,
- splits long unbroken tokens/URLs,
- paginates before text crosses the bottom margin.

Portuguese/Latin text supported by WinAnsi remains intact. Full CJK/emoji-quality output would require bundling/embedding an appropriate Unicode font, which is intentionally outside this release.

## Task lifecycle

The API already supported `TODO`, `IN_PROGRESS`, and `DONE`. The UI now exposes all three states by cycling TODO → IN_PROGRESS → DONE → TODO, with distinct visual and accessible labels.

## Dialog accessibility

New/Edit Project dialogs now use semantic dialog state, `aria-modal`, labelled headings, Escape-to-close, focus trapping, focus restoration, background scroll lock, and inline error regions. No backend behavior changed.

## Deploy reproducibility

All direct production dependencies are exact-pinned and Node 22.x is declared in package metadata in addition to Netlify configuration. `.npmrc` enforces exact saves, engine checks, and package-lock generation.

A fresh `npm install --package-lock-only` attempt timed out against the npm registry in this environment. No package-lock was fabricated and no partial install artifacts were kept. A lockfile should be generated in a networked build environment before treating dependency resolution as fully deterministic.

## Database

No migration added. The original foundation migration remains unchanged.
