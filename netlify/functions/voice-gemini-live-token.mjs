import {requireUser} from './_shared/auth.mjs';
import {readJson,json,errorJson,getRequestId} from './_shared/http.mjs';
import {consumeEndpointRate} from './_shared/limits.mjs';
import {loadVoiceMemoryContext} from './_shared/voice-memory-context.mjs';
const MODEL='gemini-3.8-live';
export default async function handler(req,context){
 const requestId=getRequestId(req,context,null);
 if(req.method!=='POST')return errorJson('Method not allowed',405,'METHOD_NOT_ALLOWED',requestId);
 const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
 try{
  const body=await readJson(req);
  if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('Invalid request',400,'INVALID_JSON',requestId);
  const key=globalThis.Netlify?.env?.get?.('GEMINI_API_KEY')||process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
  if(!key)return errorJson('Google Gemini Live is not configured',501,'GEMINI_LIVE_NOT_CONFIGURED',requestId);
  const memory=await loadVoiceMemoryContext(auth.db,auth.user.id,{projectId:body.projectId||null,conversationId:body.conversationId||null});
  if(memory.error)return errorJson(memory.error.message,memory.error.status,memory.error.code,requestId);
  await consumeEndpointRate(auth.db,auth.user.id,'voice_realtime_session',requestId,60);
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({uses:1,expireTime:new Date(Date.now()+10*60*1000).toISOString(),newSessionExpireTime:new Date(Date.now()+60*1000).toISOString(),liveConnectConstraints:{model:MODEL}})});
  if(!response.ok){const status=response.status;let upstreamCode='';try{const failure=await response.json();upstreamCode=String(failure?.error?.status||failure?.error?.code||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,50)}catch{}console.warn('Gemini Live token rejected',requestId,status,upstreamCode);const message=status===429?'Google Gemini Live quota or rate limit reached':status===401||status===403?'Google rejected Gemini API key or project access':status===400||status===404?'Google rejected Gemini Live model or session configuration':'Google rejected the Gemini Live session request';return errorJson(message+(upstreamCode?' ('+upstreamCode+')':''),status===429?429:status===401?401:status===403?403:502,'GEMINI_LIVE_TOKEN_FAILED',requestId);}
  const data=await response.json();
  if(!data.name)return errorJson('Google returned no ephemeral token',502,'GEMINI_LIVE_TOKEN_INVALID',requestId);
  return json({token:data.name,model:'models/'+MODEL,memoryContext:memory.memoryContext,requestId});
 }catch{return errorJson('Could not initialize Gemini Live',500,'GEMINI_LIVE_FAILED',requestId)}
}
export const config={path:'/api/voice/gemini-live-token'};
