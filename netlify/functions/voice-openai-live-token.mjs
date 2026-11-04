import {requireUser} from './_shared/auth.mjs';
import {readJson,json,errorJson,getRequestId} from './_shared/http.mjs';
import {consumeEndpointRate} from './_shared/limits.mjs';
import {loadVoiceMemoryContext} from './_shared/voice-memory-context.mjs';
const VOICES=new Set(['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar']);
export default async function handler(req,context){
 const id=getRequestId(req,context,null);
 if(req.method!=='POST')return errorJson('Method not allowed',405,'METHOD_NOT_ALLOWED',id);
 const auth=await requireUser(req,id);if(auth.error)return auth.error;
 try{
  const body=await readJson(req);
  if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('Invalid request',400,'INVALID_JSON',id);
  const key=globalThis.Netlify?.env?.get?.('OPENAI_API_KEY')||process.env.OPENAI_API_KEY;
  if(!key)return errorJson('OpenAI API key is not configured',501,'OPENAI_LIVE_NOT_CONFIGURED',id);
  const voice=String(body.voice||'marin').toLowerCase();
  if(!VOICES.has(voice))return errorJson('Unsupported OpenAI voice',400,'INVALID_OPENAI_VOICE',id);
  const memory=await loadVoiceMemoryContext(auth.db,auth.user.id,{projectId:body.projectId||null,conversationId:body.conversationId||null});
  if(memory.error)return errorJson(memory.error.message,memory.error.status,memory.error.code,id);
  await consumeEndpointRate(auth.db,auth.user.id,'voice_realtime_session',id,60);
  const model=globalThis.Netlify?.env?.get?.('OPENAI_REALTIME_MODEL')||process.env.OPENAI_REALTIME_MODEL||'gpt-realtime-mini';
  if(!/^[a-zA-Z0-9._-]{3,80}$/.test(model))return errorJson('Invalid realtime model',500,'INVALID_REALTIME_MODEL',id);
  const response=await fetch('https://api.openai.com/v1/realtime/client_secrets',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({session:{type:'realtime',model,audio:{output:{voice}}}})});
  if(!response.ok)return errorJson(response.status===429?'OpenAI quota or rate limit reached':response.status===401||response.status===403?'OpenAI rejected API key or model access':'OpenAI session request failed',response.status===429?429:502,'OPENAI_LIVE_TOKEN_FAILED',id);
  const data=await response.json(),clientSecret=typeof data.value==='string'?data.value:data.client_secret?.value;
  if(!clientSecret)return errorJson('No OpenAI session token returned',502,'OPENAI_LIVE_TOKEN_INVALID',id);
  return json({clientSecret,model,memoryContext:memory.memoryContext,requestId:id});
 }catch{return errorJson('Could not initialize OpenAI Realtime',500,'OPENAI_LIVE_FAILED',id)}
}
export const config={path:'/api/voice/openai-live-token'};
