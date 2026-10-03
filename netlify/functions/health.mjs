import { requireUser } from './_shared/auth.mjs';
import { providerStatus, providerRuntimeHealth, availableModels, serverTranscriptionConfigured } from './_shared/models.mjs';
import { json, getRequestId, errorJson } from './_shared/http.mjs';
import { opportunisticDrainBlobGc } from './_shared/storage.mjs';

const PROVIDERS=['openai','anthropic','gemini','openrouter'];

function addProvider(set,value){const p=String(value||'').toLowerCase();if(PROVIDERS.includes(p))set.add(p);}
function successfulProviders(row){
  const out=new Set();
  addProvider(out,String(row?.lead_model||'').split(':')[0]);
  const trace=row?.trace||{};
  addProvider(out,trace?.lead?.provider);addProvider(out,trace?.director?.provider);addProvider(out,trace?.specialist?.provider);
  for(const item of Array.isArray(trace?.team)?trace.team:[])addProvider(out,item?.provider);
  return out;
}
function failedProviders(row){
  const out=new Set();const trace=row?.trace||{};
  for(const item of [...(Array.isArray(trace?.attempts)?trace.attempts:[]),...(Array.isArray(trace?.fallbacks)?trace.fallbacks:[]),...(Array.isArray(trace?.failures)?trace.failures:[])])addProvider(out,item?.provider);
  return out;
}

async function persistedProviderReadiness(db,userId,configured,runtime){
  const rows=await db.sql`SELECT state,lead_model,trace,COALESCE(completed_at,started_at) AS observed_at FROM executions WHERE owner_id=${userId} AND started_at > now() - interval '24 hours' ORDER BY started_at DESC LIMIT 80`;
  const evidence=Object.fromEntries(PROVIDERS.map(p=>[p,{lastSuccessAt:null,lastFailureAt:null}]));
  for(const row of rows){
    const at=row.observed_at?new Date(row.observed_at).toISOString():null;
    if(row.state==='COMPLETED'||row.state==='PARTIAL')for(const p of successfulProviders(row))if(!evidence[p].lastSuccessAt)evidence[p].lastSuccessAt=at;
    if(row.state==='FAILED')for(const p of failedProviders(row))if(!evidence[p].lastFailureAt)evidence[p].lastFailureAt=at;
  }
  return Object.fromEntries(PROVIDERS.map(provider=>{
    const ev=evidence[provider],local=runtime[provider]||{};let status='not_configured';
    if(configured[provider]){
      if(local.circuitOpen)status='degraded';
      else if(ev.lastSuccessAt && (!ev.lastFailureAt || Date.parse(ev.lastSuccessAt)>=Date.parse(ev.lastFailureAt)))status='observed_healthy';
      else if(ev.lastFailureAt)status='recent_failure';
      else status='configured_unverified';
    }
    return [provider,{status,configured:Boolean(configured[provider]),lastSuccessAt:ev.lastSuccessAt,lastFailureAt:ev.lastFailureAt,circuitOpen:Boolean(local.circuitOpen),retryAfterMs:Number(local.retryAfterMs||0)}];
  }));
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
  const runtime=providerRuntimeHealth();
  const configuredModels=availableModels({ignoreCircuit:true});
  const activeModels=availableModels();
  const readiness=await persistedProviderReadiness(db,user.id,providers,runtime);
  const chatState=chatReadiness(readiness,configuredModels,activeModels);
  const storageMaintenance=await opportunisticDrainBlobGc(db,user.id,{limit:5}).catch(()=>({attempted:0,deleted:0,failed:0,pending:null,skipped:true}));
  return json({
    requestId,
    providers,
    providerHealth:runtime,
    providerReadiness:readiness,
    models:configuredModels.map(m=>({provider:m.provider,id:m.id,roles:m.roles})),
    capabilityReadiness:{
      chat:chatState,
      documents:chatState,
      imageGeneration:providers.openai?(runtime.openai?.circuitOpen?'degraded':'configured_unverified'):'unavailable',
      imageEditing:providers.openai?(runtime.openai?.circuitOpen?'degraded':'configured_unverified'):'unavailable',
      imageUnderstanding:availableModels({vision:true,ignoreCircuit:true}).length?(availableModels({vision:true}).length?'configured_unverified':'degraded'):'unavailable',
      serverTranscription:serverTranscriptionConfigured()?'configured_unverified':'unavailable',
      webSearch:providers.openai?(runtime.openai?.circuitOpen?'degraded':'configured_unverified'):'unavailable',
    },
    capabilities:{
      chat:activeModels.length>0,
      projects:true,
      files:true,
      artifacts:true,
      imageGeneration:Boolean(providers.openai&&!runtime.openai?.circuitOpen),
      imageEditing:Boolean(providers.openai&&!runtime.openai?.circuitOpen),
      imageUnderstanding:availableModels({vision:true}).length>0,
      webSearch:Boolean(providers.openai&&!runtime.openai?.circuitOpen),
      voiceInput:'browser_native',
      serverTranscription:serverTranscriptionConfigured(),
      paginatedHistory:true,
      archiveSafety:true,
      storageMaintenance:true,
    },
    storageMaintenance,
    note:'Provider readiness uses recent execution evidence stored in OlyHub plus the current Function runtime circuit state. CONFIGURED UNVERIFIED means credentials/models are present but no recent successful execution is recorded. OBSERVED HEALTHY means OlyHub recorded a successful use in the last 24 hours. RECENT FAILURE means the latest stored evidence is a failure. Image/audio endpoint readiness remains configuration-based unless that capability is actually exercised. Web search uses the OpenAI Responses web_search capability through the configured OpenAI gateway and is invoked only for explicit/current-information intent.'
  });
}

export default async(req,context)=>{
  const requestId=getRequestId(req,context,null);
  try{return await handler(req,context);}catch(error){console.error('Health API failure',requestId,error?.stack||error?.message||error);return errorJson('Runtime diagnostics could not be loaded.',500,'HEALTH_RUNTIME_FAILURE',requestId);}
};
export const config={path:'/api/health'};
