# Olympus — Controlled automation integration plan

## Current implementation status
Phase 1: registry and fail-closed authorization contract added. **No vendor service, adapter, OAuth account, job or deployment is connected by this change.** Registry entries are not tools available to users.

## Controlled commits on main
1. **Inventory and safety contract**: declare providers, separate publishing from advertising spend, tests and documentation.
2. **Execution infrastructure**: evaluate existing Netlify worker/queue and integrate n8n workflows, LangGraph agent state and Trigger.dev durable jobs only where they add functionality. Configure external hosting, signed callbacks, idempotency and retries. Do not duplicate the current execution ledger.
3. **Authenticated tools**: Composio and MCP bridge; Stagehand isolated browser worker with domain allowlists, secrets isolation and audit trails.
4. **Creative production and distribution**: Remotion rendering worker, Postiz publishing with per-account OAuth, draft/approval flow, asset retention and publishing status.
5. **Marketing, analytics and commerce**: Mautic campaigns; Medusa commerce backend as optional alternative to Shopify; PostHog events and funnels; Meta Marketing API and Google Ads API with scoped OAuth, currency and explicit spending ceilings.
6. **Voice autonomy**: Live Talk sends structured commands to the existing Olympus engine, tracks persistent execution IDs, polls results, provides progress, and uses the same authorization gates. Voice cannot bypass approvals.

## Validation required for each integration
- Check license, deployment requirements, vendor API terms, usage costs and compatibility.
- Keep keys/tokens in secure server environments; never put them in browser JS or model context.
- Validate all external inputs, enforce user/project scope, timeout, rate limits, retries and idempotency.
- Distinguish configured / authenticated / verified / operational; verify authenticated end-to-end execution before calling it operational.
- Require separate consent for publishing and spending; enforce maximum budget for ads.
- Run unit, integration, production smoke and rollback checks before enabling.
- Only use main; consolidate coherent changes into controlled commits.

## Source repositories to assess
- https://github.com/n8n-io/n8n
- https://github.com/langchain-ai/langgraph
- https://github.com/ComposioHQ/composio
- https://github.com/triggerdotdev/trigger.dev
- https://github.com/browserbase/stagehand
- https://github.com/modelcontextprotocol/servers
- https://github.com/gitroomhq/postiz-app
- https://github.com/mautic/mautic
- https://github.com/medusajs/medusa
- https://github.com/PostHog/posthog
- https://github.com/remotion-dev/remotion
