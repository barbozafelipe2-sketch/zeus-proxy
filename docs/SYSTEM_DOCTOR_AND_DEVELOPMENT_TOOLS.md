# Doctor, costs and development tools — 12 November 2026

## Implemented

- Settings → Doctor summarizes `/api/health`: database connectivity, blob maintenance, recent provider evidence, active/expired execution leases, text-cost coverage and production verification still outstanding. Refresh makes no AI calls and never restarts work. The existing health endpoint still performs its existing owner bootstrap and opportunistic blob GC.
- Queue inspection is owner scoped, limited to 100 active records in the last 24 hours, and explicitly marks truncation. It uses the same expiry function as request recovery. It is an observation, not a repair operation or complete historical audit.
- Trace Lab displays each attempt's tokens and estimated cost only when its positional usage entry also matches provider/model/stage/outcome. Failed or missing usage remains unknown; prices are existing estimates, not provider invoice amounts. No model/role/pipeline or price changes.
- `ZEUS_PROXY_SMOKE_BASE_URL=https://your-exact-app.example npm run doctor` prints the same summary. Add `-- --json` for machine-readable output. It rejects redirects/login HTML. Exit 0 means report obtained with pending checks, **not production approval**; 1 means blocked checks; 2 means unavailable/misconfigured. No automatic paid provider benchmark.
- Missing smoke URL now fails the existing live-smoke configuration gate instead of producing a green skipped probe. Existing paid-AI confirmation remains unchanged.
- `npm run test:browser` exercises Doctor refresh, failure/stale evidence, and persisted trace rendering in desktop/mobile Chromium, with mocked API reads and all writes forbidden. Run `npm run build` and `npx playwright install chromium` first. CI runs these separately from unit tests. This does not test real Postgres, model calls, files or Safari hardware.

## MCP scope

`.mcp.json` prepares the official Context7 remote endpoint for development clients that support repository MCP configuration. Loading/activating it depends on the client. It does not give Poseidon a new runtime capability, and does not inherit ChatGPT connectors. Anonymous service limits apply; any optional key belongs in the client's secret settings, never this file. Send documentation queries, never secrets, prompts with personal data or private source trees.

References: https://github.com/upstash/context7/blob/master/plugins/claude/context7/.mcp.json and https://github.com/upstash/context7/blob/master/server.json .

GitHub, Netlify, Google Workspace and artifact capabilities already present in the app are preserved. Adding duplicate MCP servers is unnecessary for this change. No Supabase migration, second memory store, Stripe integration, Cloudflare infrastructure, or community scanner was added.

## Operational acceptance still required

Identify the exact protected Netlify destination and verify the published commit. Run Doctor there and inspect incomplete evidence. Configure the existing smoke URL in GitHub only after destination/access are known. Validate real provider use, project file upload/download, artifact persistence and background recovery against that destination. The approved coordinator and specialist architecture stays unchanged.
