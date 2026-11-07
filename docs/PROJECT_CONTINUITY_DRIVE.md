# Project Continuity, Trace Lab, and approved Google Drive writing

## Status
Code is wired into the server and project Overview UI. This is NOT a verified production release. Existing owner auth is still a fixed single-owner workspace. Netlify SSO team login protects the current site, but this must be checked for all API and alternate hostnames before enabling writes.

## Incremental project continuity
Open a project → Overview → **Resumo vivo** → **Atualizar lote**. Each explicit click summarizes up to 30 previously unprocessed user/assistant messages across project conversations; at most one paid model call is allowed per click. A cursor based on (created_at, message id) prevents normal repetition. Revisions are append-only and the last valid summary is retained if a new model attempt fails. Click again if the UI says more messages remain. No automatic billable summary jobs, destructive history compression or chat deletion are enabled.

Approved project memories and owner Source of Truth still take priority. The generated summary is historical evidence, never elevated to instructions.

## Google Drive publisher
1. Existing OAuth read-only Drive connection is unchanged.
2. Settings has a separate **Google Drive (criação)** connection requesting `https://www.googleapis.com/auth/drive.file`, which lets this app create/manage only app-authorized files. This is NOT unrestricted Drive edit access.
3. An operator must review authentication protection of the site and its Functions and explicitly set `OLYHUB_DRIVE_WRITES_ENABLED=1` in the Netlify Functions environment to permit writes. The flag defaults to OFF. A redeploy may be required for environment changes.
4. In a project with an available summary, click **Revisar e criar no Drive**. This creates a versioned, owner/project-bound draft in the DB. Review the complete content and explicitly click **Criar este documento**. No passive chat, model, cron, project refresh or GET request can publish a document.
5. The server checks the summary version before running a write and stores a lease token. On retries it checks for a Drive file with the same private `appProperties.olyhubApprovalId` before creating. After the provider confirms the create, it records document ID and link. It never overwrites, shares or deletes other Drive files.

### Deployment prerequisites
- Apply migration `20261107090000_project_continuity` to the target database before running new endpoints.
- Verify site-wide SSO and API protection, especially alternative routes. For public/multi-user access, replace constant `zeus-personal-owner` with real server-verified user authorization before enabling Drive writes.
- Configure Google OAuth credentials and encryption key, connect `drive_write` once, then choose whether to enable the write flag.
- Verify the project's correct Google OAuth redirect URI and scopes in Cloud Console.
- Perform an actual Google Drive test with consent and a throwaway project; the GitHub tests only exercise mocks.
- Do not manually deploy while Netlify credits are constrained. A push to `main` could still be deployed automatically by existing Netlify configuration.

## Trace Lab context receipt
Each completed model response stores a safe manifest of context *types and counts*, not the secret prompt: approved personal and project memories, recent conversation turns, included project file excerpts, attached files, Source of Truth records retrieved, prior-chat lookup, and summary revision. Only store/render information actually assembled. Previous replies do not retroactively gain this field.

## Known limitations
- This is a snapshot-to-new-document workflow. Updating existing Drive documents or creating folders is deliberately not enabled.
- An interrupted Google create may require retry and a provider search before the DB can confirm completion. Google search indexing can be delayed, so do not blindly repeat uncertain writes.
- Summary updates use Gateway models and incur provider usage; they do not run automatically. Billing integration for this separate maintenance call is not yet included in the normal chat usage widget.
- A green GitHub CI checks source and mocks, not the live Netlify database, Google OAuth approval, or real delivery.