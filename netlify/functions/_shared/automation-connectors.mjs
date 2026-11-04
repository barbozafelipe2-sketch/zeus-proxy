// Olympus external connector registry: a declared connector is NOT an installed integration.
// Keep credentials on the server and fail closed until authenticated adapters are verified.
export const AUTOMATION_CONNECTORS=Object.freeze({
 n8n:{kind:'workflow',env:'N8N_BASE_URL',approval:'external_write'},
 langgraph:{kind:'agent_orchestration',env:'LANGGRAPH_DEPLOYMENT_URL',approval:'external_write'},
 composio:{kind:'tool_auth',env:'COMPOSIO_API_KEY',approval:'external_write'},
 triggerdev:{kind:'durable_jobs',env:'TRIGGER_SECRET_KEY',approval:'external_write'},
 stagehand:{kind:'browser',env:'BROWSER_WORKER_URL',approval:'external_write'},
 mcp:{kind:'tool_protocol',env:'MCP_BRIDGE_URL',approval:'external_write'},
 postiz:{kind:'social_publishing',env:'POSTIZ_API_KEY',approval:'publish'},
 mautic:{kind:'marketing_automation',env:'MAUTIC_BASE_URL',approval:'external_write'},
 medusa:{kind:'commerce_backend',env:'MEDUSA_BACKEND_URL',approval:'external_write'},
 posthog:{kind:'analytics',env:'POSTHOG_PROJECT_KEY',approval:'read'},
 remotion:{kind:'video_render',env:'REMOTION_WORKER_URL',approval:'external_write'},
 meta_ads:{kind:'paid_ads',env:'META_MARKETING_ACCESS_TOKEN',approval:'spend'},
 google_ads:{kind:'paid_ads',env:'GOOGLE_ADS_DEVELOPER_TOKEN',approval:'spend'},
 shopify:{kind:'commerce',env:'SHOPIFY_ADMIN_ACCESS_TOKEN',approval:'external_write'}
});
export function connectorInventory(env={}){
 return Object.entries(AUTOMATION_CONNECTORS).map(([id,c])=>({
  id,kind:c.kind,configured:Boolean(typeof env[c.env]==='string'&&env[c.env].trim()),
  verified:false,operational:false,approval:c.approval
 }));
}
export function authorizeExternalAction({connectorId,action,approved=false,publishApproved=false,spendApproved=false,budget=null}={}){
 const connector=AUTOMATION_CONNECTORS[connectorId];
 if(!connector)return {allowed:false,reason:'unknown_connector'};
 if(typeof action!=='string'||!action.trim())return {allowed:false,reason:'missing_action'};
 if(connector.approval==='read')return {allowed:true,reason:'permission_gate_only'};
 if(!approved)return {allowed:false,reason:'approval_required'};
 if(connector.approval==='publish'&&!publishApproved)return {allowed:false,reason:'publish_approval_required'};
 if(connector.approval==='spend'&&(!spendApproved||!Number.isFinite(budget)||budget<=0))return {allowed:false,reason:'spend_budget_approval_required'};
 return {allowed:true,reason:'permission_gate_only'};
}
