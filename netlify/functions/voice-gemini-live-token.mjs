import {requireUser} from './_shared/auth.mjs';
import {readJson,json,errorJson,getRequestId} from './_shared/http.mjs';
import {consumeEndpointRate} from './_shared/limits.mjs';
import {loadVoiceMemoryContext} from './_shared/voice-memory-context.mjs';
const MODEL='models/gemini-2.5-flash-native-audio-preview-09-2025';
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
  const response=await fetch('https://generativelanguage.googleapis.com/v1alpha/auth_tokens',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({uses:1,expireTime:new Date(Date.now()+10*60*1000).toISOString(),newSessionExpireTime:new Date(Date.now()+60*1000).toISOString(),liveConnectConstraints:{model:MODEL}})});
  if(!response.ok)return errorJson('Google rejected the Gemini Live session request',502,'GEMINI_LIVE_TOKEN_FAILED',requestId);
  const data=await response.json();
  if(!data.name)return errorJson('Google returned no ephemeral token',502,'GEMINI_LIVE_TOKEN_INVALID',requestId);
  return json({token:data.name,model:MODEL,memoryContext:memory.memoryContext,requestId});
 }catch{return errorJson('Could not initialize Gemini Live',500,'GEMINI_LIVE_FAILED',requestId)}
}
export const config={path:'/api/voice/gemini-live-token'};
