import { requireUser } from './_shared/auth.mjs';
import { providerStatus, providerRuntimeHealth, providerTransportStatus, availableModels, serverTranscriptionConfigured } from './_shared/models.mjs';
import { summarizeTransportEvidence } from './_shared/provider-observability.mjs';
import { json, getRequestId, errorJson } from './_shared/http.mjs';
import { opportunisticDrainBlobGc } from './_shared/storage.mjs';
import { githubWriteConfigured } from './_shared/github-write.mjs';

const PROVIDERS=['openai','anthropic','gemini','openrouter'];

const SECRETISH=/(postgres(?:ql)?:\/\/\S+|password=\S+|(?:sk|rk|xai)-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|Bearer\s+\S+)/gi;
export function safeDbError(error){
  const code=typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code)?error.code+' ':'';
  const msg=String(error?.message||error||'unknown error').split('\n')[0].replace(SECRETISH,'[redacted]').slice(0,200);
  return (code+msg).trim();
}
function withTimeout(promise,ms,label){
  let t;return Promise.race([Promise.resolve().then(()=>promise),new Promise((_,rej)=>{t=setTimeout(()=>rej(Object.assign(new Error(`${label} timed out after ${ms}ms`),{code:'TIMEOUT'})),ms);})]).finally(()=>clearTimeout(t));
}
function fallbackReadiness(providers,transports){
  const providerResults=Object.fromEntries(PROVIDERS.map(p=>[p,{status:providers[p]?'configured_unverified':'not_configured',configured:Boolean(providers[p]),lastSuccessAt:null,lastFailureAt:null,circuitOpen:false,retryAfterMs:0}]));
  const transportResults=Object.fromEntries(Object.keys(transports||{}).map(t=>[t,{status:transports[t]?'configured_unverified':'not_configured',configured:Boolean(transports[t]),lastSuccessAt:null,lastFailureAt:null}]));
  return {providerResults,transportResults};
}

function addProvider(set,value){const p=String(value||'').toLowerCase();if(PROVIDERS.includes(p))set.add(p);}
function successfulProviders(row){
  const out=new Set();
  const events=row?.trace?.providerTelemetry?.attempts;
  if(Array.isArray(events)&&events.length){
    for(const e of events)if(e.transport==='gateway'&&e.outcome==='success')addProvider(out,e.provider);
    return out;
  }
  addProvider(out,String(row?.lead_model||'').split(':')[0]);
  const trace=row?.trace||{};
  addProvider(out,trace?.lead?.provider);addProvider(out,trace?.director?.provider);addProvider(out,trace?.specialist?.provider);
  for(const item of Array.isArray(trace?.team)?trace.team:[])addProvider(out,item?.provider);
  return out;
}
function failedProviders(row){
  const out=new Set();const trace=row?.trace||{};
  const events=trace.providerTelemetry?.attempts;
  if(Array.isArray(events)&&events.length){
    for(const e of events)if(e.transport==='gateway'&&e.outcome==='failure')addProvider(out,e.provider);
    return out;
  }
  for(const item of [...(Array.isArray(trace?.attempts)?trace.attempts:[]),...(Array.isArray(trace?.fallbacks)?trace.fallbacks:[]),...(Array.isArray(trace?.failures)?trace.failures:[])])addProvider(out,item?.provider);
  return out;
}

async function persistedProviderReadiness(db,userId,configured,runtime,transports){
  const rows=await db.sql`SELECT state,lead_model,trace,COALESCE(completed_at,started_at) AS observed_at FROM executions WHERE owner_id=${userId} AND started_at > now() - interval '24 hours' ORDER BY started_at DESC LIMIT 80`;
  const evidence=Object.fromEntries(PROVIDERS.map(p=>[p,{lastSuccessAt:null,lastFailureAt:null}]));
  for(const row of rows){
    const at=row.observed_at?new Date(row.observed_at).toISOString():null;
    const events=row?.trace?.providerTelemetry?.attempts;
    if(Array.isArray(events)&&events.length){
      // Even a COMPLETED execution may have failed Gateway attempts before a successful direct recovery.
      for(const item of events){
        const p=String(item?.provider||'').toLowerCase();
        if(item?.transport!=='gateway'||!evidence[p])continue;
        if(item.outcome==='success'&&!evidence[p].lastSuccessAt)evidence[p].lastSuccessAt=at;
        if(item.outcome==='failure'&&!evidence[p].lastFailureAt)evidence[p].lastFailureAt=at;
      }
    }else{
      if(row.state==='COMPLETED'||row.state==='PARTIAL')for(const p of successfulProviders(row))if(!evidence[p].lastSuccessAt)evidence[p].lastSuccessAt=at;
      if(row.state==='FAILED')for(const p of failedProviders(row))if(!evidence[p].lastFailureAt)evidence[p].lastFailureAt=at;
    }
  }
  const providerResults=Object.fromEntries(PROVIDERS.map(provider=>{
    const ev=evidence[provider],local=runtime[provider]||{};let status='not_configured';
    if(configured[provider]){
      if(local.circuitOpen)status='degraded';
      else if(ev.lastSuccessAt && (!ev.lastFailureAt || Date.parse(ev.lastSuccessAt)>=Date.parse(ev.lastFailureAt)))status='observed_healthy';
      else if(ev.lastFailureAt)status='recent_failure';
      else status='configured_unverified';
    }
    return [provider,{status,configured:Boolean(configured[provider]),lastSuccessAt:ev.lastSuccessAt,lastFailureAt:ev.lastFailureAt,circuitOpen:Boolean(local.circuitOpen),retryAfterMs:Number(local.retryAfterMs||0)}];
  }));
  const transportResults=summarizeTransportEvidence(rows,{
    gateway:Object.values(configured).some(Boolean),
    openrouter_direct:transports.openrouter_direct,
    openai_direct:transports.openai_direct
  },runtime);
  return {providerResults,transportResults};
}

function chatReadiness(readiness,configuredModels,activeModels){
  if(!configuredModels.length)return 'unavailable';
  if(!activeModels.length)return 'degraded';
  const states=Object.values(readiness).map(v=>v.status);
  if(states.includes('observed_healthy'))return 'observed_healthy';
  if(states.includes('configured_unverified'))return 'configured_unverified';
  return states.includes('recent_failure')?'recent_failure':'configured_unverified';
}

async function handler(req,context){
  const requestId=getRequestId(req,context,null);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
  const{user,db}=auth;
  const providers=providerStatus();
  const transports=providerTransportStatus();
  const runtime=providerRuntimeHealth();
  const configuredRoutes=Object.values(providers).filter(Boolean).length+Number(transports.openrouter_direct)+Number(transports.openai_direct);
  const configuredModels=availableModels({ignoreCircuit:true});
  const activeModels=availableModels();
  const warnings0=[];
  let readinessSection;
  try{readinessSection=await withTimeout(persistedProviderReadiness(db,user.id,providers,runtime,transports),5000,'providerReadiness');}
  catch(error){const message=safeDbError(error);console.error('Health section failure',requestId,'providerReadiness',error?.stack||message);warnings0.push({section:'providerReadiness',message});readinessSection=fallbackReadiness(providers,transports);}
  const {providerResults:readiness,transportResults:transportReadiness}=readinessSection;
  const chatState=chatReadiness(readiness,configuredModels,activeModels);
  const storageMaintenance=await withTimeout(opportunisticDrainBlobGc(db,user.id,{limit:5}),3000,'storageMaintenance').catch(()=>({attempted:0,deleted:0,failed:0,pending:null,skipped:true}));
  const githubWrite=githubWriteConfigured();
  const warnings=warnings0;
  const degrade=(section,error,fallback)=>{const message=safeDbError(error);console.error('Health section failure',requestId,section,error?.stack||message);warnings.push({section,message});return fallback;};
  const spendRows=db.sql`
    SELECT COALESCE(SUM(CASE WHEN (trace->'usage'->>'estimatedUsd') ~ '^[0-9]{1,12}([.][0-9]{1,12})?$'
      THEN (trace->'usage'->>'estimatedUsd')::numeric ELSE 0 END),0)::float8 AS known_usd,
      count(*) FILTER (WHERE trace->'usage'->>'estimateCoverage' IN ('partial','none') OR trace->'usage' IS NULL)::int AS incomplete_count
    FROM executions WHERE owner_id=${user.id}
      AND started_at >= date_trunc('month',now())
      AND started_at < date_trunc('month',now()) + interval '1 month'
  `;
  const spendRowsSafe=await withTimeout(spendRows,5000,'monthlyBudget').catch(error=>degrade('monthlyBudget',error,[{known_usd:0,incomplete_count:0}]));
  const usd=Number(spendRowsSafe?.[0]?.known_usd||0),monthlyTarget=Math.max(1,Number(globalThis.Netlify?.env?.get?.('ZEUS_MONTHLY_TOTAL_USD')||process.env?.ZEUS_MONTHLY_TOTAL_USD)||60);
  return json({
    degraded:warnings.length>0,
    warnings,
    monthlyBudget:{targetUsd:monthlyTarget,knownTextUsd:Number(usd.toFixed(4)),unpricedExecutionCount:Number(spendRowsSafe?.[0]?.incomplete_count||0),targetReached:usd>=monthlyTarget,policy:'advisory_only',coverage:'partial_text_only',mediaIncluded:false},
    requestId,
    providers,
    transports,
    providerHealth:runtime,
    providerReadiness:readiness,
    transportReadiness,
    models:configuredModels.map(m=>({provider:m.provider,id:m.id,roles:m.roles})),
    capabilityReadiness:{
      chat:chatState,
      documents:chatState,
      imageGeneration:providers.openai?(runtime.openai?.circuitOpen?'degraded':'configured_unverified'):'unavailable',
      imageEditing:providers.openai?(runtime.openai?.circuitOpen?'degraded':'configured_unverified'):'unavailable',
      imageUnderstanding:availableModels({vision:true,ignoreCircuit:true}).length?(availableModels({vision:true}).length?'configured_unverified':'degraded'):'unavailable',
      serverTranscription:serverTranscriptionConfigured()?'configured_unverified':'unavailable',
      webSearch:providers.openai?(runtime.openai?.circuitOpen?'degraded':'configured_unverified'):'unavailable',
      githubCommit:githubWrite?'configured_unverified':'unavailable',
    },
    capabilities:{
      chat:['observed_healthy','configured_unverified'].includes(chatState),
      projects:true,
      files:true,
      artifacts:true,
      imageGeneration:Boolean(providers.openai&&!runtime.openai?.circuitOpen),
      imageEditing:Boolean(providers.openai&&!runtime.openai?.circuitOpen),
      imageUnderstanding:availableModels({vision:true}).length>0,
      webSearch:Boolean(providers.openai&&!runtime.openai?.circuitOpen),
      voiceInput:serverTranscriptionConfigured()?'automatic_multilingual':'browser_native',
      serverTranscription:serverTranscriptionConfigured(),
      paginatedHistory:true,
      archiveSafety:true,
      storageMaintenance:true,
      githubRepositoryPublic:true,
      githubPrivateRepository:Boolean(globalThis.Netlify?.env?.get?.('GITHUB_TOKEN')||process.env?.GITHUB_TOKEN),
      githubCommit:githubWrite,
    },
    goLive:{privateAccess:Boolean(globalThis.Netlify?.env?.get?.('ZEUS_PROXY_ACCESS_TOKEN')||process.env?.ZEUS_PROXY_ACCESS_TOKEN),database:true,blobMaintenance:!storageMaintenance?.failed,configuredProviders:configuredRoutes,chatState,ready:Boolean((globalThis.Netlify?.env?.get?.('ZEUS_PROXY_ACCESS_TOKEN')||process.env?.ZEUS_PROXY_ACCESS_TOKEN)&&configuredRoutes>0&&['observed_healthy','configured_unverified'].includes(chatState))},
    storageMaintenance,
    note:'Provider readiness uses recent execution evidence stored in OlyHub plus the current Function runtime circuit state. Transport readiness uses sanitized per-model attempts from the past 24 hours; the circuit breaker shown here applies only to the current Function instance. CONFIGURED UNVERIFIED means credentials/models are present but no recent successful execution is recorded. OBSERVED HEALTHY means OlyHub recorded a successful use in the last 24 hours. RECENT FAILURE means the latest stored evidence is a failure. Image/audio endpoint readiness remains configuration-based unless that capability is actually exercised. GitHub public repository retrieval is built in; private repository retrieval and GitHub commits require a server-side GITHUB_TOKEN with access to the target repositories. GitHub writes are atomic, non-force branch updates from validated ZIP project packages. Web search uses the OpenAI Responses web_search capability through the configured OpenAI gateway and is invoked only for explicit/current-information intent.'
  });
}

export default async(req,context)=>{
  const requestId=getRequestId(req,context,null);
  try{return await handler(req,context);}catch(error){console.error('Health API failure',requestId,error?.stack||error?.message||error);return errorJson(`Runtime diagnostics could not be loaded: ${safeDbError(error)}`,500,'HEALTH_RUNTIME_FAILURE',requestId);}
};
export const config={path:'/api/health'};
