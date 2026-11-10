import {requireUser} from './_shared/auth.mjs';
import {readJson,json,errorJson,getRequestId} from './_shared/http.mjs';
import {consumeEndpointRate} from './_shared/limits.mjs';
import {loadVoiceMemoryContext} from './_shared/voice-memory-context.mjs';
export default async function handler(req,context){
 const requestId=getRequestId(req,context,null);
 if(req.method!=='POST')return errorJson('Method not allowed',405,'METHOD_NOT_ALLOWED',requestId);
 const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
 try{
  const body=await readJson(req);
  if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('Invalid request',400,'INVALID_JSON',requestId);
  await consumeEndpointRate(auth.db,auth.user.id,'voice_realtime_session',requestId,60);
  const memory=await loadVoiceMemoryContext(auth.db,auth.user.id,{projectId:body.projectId||null,conversationId:body.conversationId||null});
  if(memory.error)return errorJson(memory.error.message,memory.error.status,memory.error.code,requestId);
  return json({memoryContext:memory.memoryContext,projectId:memory.projectId,conversationId:memory.conversationId,requestId});
 }catch{return errorJson('Could not refresh voice context',500,'VOICE_CONTEXT_FAILED',requestId)}
}
export const config={path:'/api/voice/context'};
