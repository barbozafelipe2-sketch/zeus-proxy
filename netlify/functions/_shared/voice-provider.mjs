// One server-side credential contract for every enabled Live Talk provider.
// Provider API keys stay on the server; only short-lived session credentials
// are returned to the browser.
import {createElevenLabsRealtimeConversationToken,createElevenLabsRealtimeSignedUrl} from './elevenlabs-agent.mjs';

const env=name=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';
const OPENAI_VOICES=new Set(['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar']);
const GEMINI_VOICES=new Set(['Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede']);

export const DEFAULT_LIVE_VOICE_PROVIDER='openai';
export const LIVE_VOICE_PROVIDERS=Object.freeze({
 elevenlabs:Object.freeze({id:'elevenlabs',realtimeConversation:true,transports:['token','signed']}),
 openai:Object.freeze({id:'openai',realtimeConversation:true,transports:['token']}),
 gemini:Object.freeze({id:'gemini',realtimeConversation:true,transports:['token']}),
 muse:Object.freeze({id:'muse',realtimeConversation:false,transports:[]})
});

function providerError(message,status,code){return Object.assign(new Error(message),{status,code});}
function safeCode(value,max=60){return String(value||'').replace(/[^a-z0-9_-]/gi,'').slice(0,max);}

export function resolveLiveVoiceProvider(requested){
 const provider=requested==null?DEFAULT_LIVE_VOICE_PROVIDER:String(requested).trim().toLowerCase();
 if(!Object.hasOwn(LIVE_VOICE_PROVIDERS,provider))throw providerError('Unknown Live Talk provider.',400,'VOICE_PROVIDER_UNKNOWN');
 if(!LIVE_VOICE_PROVIDERS[provider].realtimeConversation)throw providerError('This provider does not have a configured realtime conversation transport.',501,'VOICE_PROVIDER_UNAVAILABLE');
 return provider;
}

async function issueOpenAiCredentials(voice='marin'){
 const key=env('OPENAI_API_KEY');
 if(!key)throw providerError('OpenAI Realtime is not configured.',501,'OPENAI_LIVE_NOT_CONFIGURED');
 const selected=String(voice||'marin').toLowerCase();
 if(!OPENAI_VOICES.has(selected))throw providerError('Unsupported OpenAI voice.',400,'INVALID_OPENAI_VOICE');
 const model=env('OPENAI_REALTIME_MODEL')||'gpt-realtime-mini';
 if(!/^[a-zA-Z0-9._-]{3,80}$/.test(model))throw providerError('Invalid realtime model.',500,'INVALID_REALTIME_MODEL');
 let response;
 try{
  response=await fetch('https://api.openai.com/v1/realtime/client_secrets',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({session:{type:'realtime',model,audio:{output:{voice:selected}}}}),signal:AbortSignal.timeout(12000)});
 }catch{throw providerError('OpenAI Realtime session request failed.',502,'OPENAI_LIVE_TOKEN_FAILED');}
 if(!response.ok){
  let upstreamCode='';try{const failure=await response.json();upstreamCode=safeCode(failure?.error?.code||failure?.error?.type)}catch{}
  const status=response.status,message=status===429?'OpenAI quota or rate limit reached':status===401||status===403?'OpenAI rejected API key or model access':status===400||status===404?'OpenAI rejected the Realtime model or session configuration':status===402?'OpenAI billing is required':'OpenAI session request failed';
  console.warn('OpenAI Realtime credential request rejected',status,upstreamCode);
  throw providerError(message+(upstreamCode?' ('+upstreamCode+')':''),status===429?429:status===401?401:status===403?403:502,'OPENAI_LIVE_TOKEN_FAILED');
 }
 const data=await response.json().catch(()=>null),clientSecret=typeof data?.value==='string'?data.value:data?.client_secret?.value;
 if(!clientSecret)throw providerError('OpenAI returned no Realtime session token.',502,'OPENAI_LIVE_TOKEN_INVALID');
 return {clientSecret,model};
}

async function issueGeminiCredentials(){
 const key=env('GEMINI_API_KEY')||env('GOOGLE_API_KEY');
 if(!key)throw providerError('Google Gemini Live is not configured.',501,'GEMINI_LIVE_NOT_CONFIGURED');
 const model=env('GEMINI_LIVE_MODEL')||'models/gemini-3.8-live';
 if(!/^models\/[a-zA-Z0-9._-]{3,100}$/.test(model))throw providerError('Invalid Gemini Live model.',500,'INVALID_GEMINI_LIVE_MODEL');
 let response;
 try{
  response=await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({uses:1,expireTime:new Date(Date.now()+10*60*1000).toISOString(),newSessionExpireTime:new Date(Date.now()+60*1000).toISOString()}),signal:AbortSignal.timeout(12000)});
 }catch{throw providerError('Google Gemini Live session request failed.',502,'GEMINI_LIVE_TOKEN_FAILED');}
 if(!response.ok){
  const status=response.status;let upstreamCode='',upstreamDetail='';
  try{const failure=await response.json();upstreamCode=safeCode(failure?.error?.status||failure?.error?.code,50);upstreamDetail=String(failure?.error?.message||'').replace(/[\r\n]/g,' ').replace(/AIza[A-Za-z0-9_-]+/g,'[redacted]').slice(0,350);}catch{}
  console.warn('Gemini Live credential request rejected',status,upstreamCode,upstreamDetail);
  const message=status===429?'Google Gemini Live quota or rate limit reached':status===401||status===403?'Google rejected Gemini API key or project access':status===400||status===404?'Google rejected Gemini Live model or session configuration':'Google rejected the Gemini Live session request';
  throw providerError(message+(upstreamCode?' ('+upstreamCode+')':'')+(upstreamDetail?' — '+upstreamDetail:''),status===429?429:status===401?401:status===403?403:502,'GEMINI_LIVE_TOKEN_FAILED');
 }
 const data=await response.json().catch(()=>null);
 if(!data?.name)throw providerError('Google returned no ephemeral token.',502,'GEMINI_LIVE_TOKEN_INVALID');
 return {token:data.name,model};
}

export async function issueLiveVoiceCredentials({provider,agent,kind,voice}={}){
 const selected=resolveLiveVoiceProvider(provider),spec=LIVE_VOICE_PROVIDERS[selected];
 if(!spec.transports.includes(kind))throw providerError('Unsupported realtime transport for this provider.',400,'VOICE_TRANSPORT_UNSUPPORTED');
 if(selected==='elevenlabs')return kind==='signed'?createElevenLabsRealtimeSignedUrl({agent}):createElevenLabsRealtimeConversationToken({agent});
 if(selected==='openai')return issueOpenAiCredentials(voice);
 if(selected==='gemini'){
  const selectedVoice=String(voice||'Kore');
  if(!GEMINI_VOICES.has(selectedVoice))throw providerError('Unsupported Gemini Live voice.',400,'INVALID_GEMINI_LIVE_VOICE');
  return issueGeminiCredentials();
 }
 throw providerError('Realtime transport not configured.',501,'VOICE_PROVIDER_UNAVAILABLE');
}
