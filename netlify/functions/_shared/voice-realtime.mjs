import {requireUser} from './auth.mjs';
import {readJson,json,errorJson,getRequestId} from './http.mjs';
import {consumeEndpointRate} from './limits.mjs';
import {loadVoiceMemoryContext} from './voice-memory-context.mjs';
import {createElevenLabsRealtimeConversationToken,createElevenLabsRealtimeSignedUrl} from './elevenlabs-agent.mjs';
export async function voiceRealtimeHandler(req,context,kind){
 const requestId=getRequestId(req,context,null);
 if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
 const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
 const {user,db}=auth;
 try{
  const body=await readJson(req);
  if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);
  const agent=body.agent===undefined?'zeus':body.agent;
  if(agent!=='zeus'&&agent!=='athena')return errorJson('Invalid Live Talk agent.',400,'INVALID_AGENT',requestId);
  const memory=await loadVoiceMemoryContext(db,user.id,{projectId:body.projectId||null,conversationId:body.conversationId||null});
  if(memory.error)return errorJson(memory.error.message,memory.error.status,memory.error.code,requestId);
  await consumeEndpointRate(db,user.id,'voice_realtime_session',requestId,60);
  const credentials=kind==='signed'?await createElevenLabsRealtimeSignedUrl({agent}):await createElevenLabsRealtimeConversationToken({agent});
  return json({...credentials,selectedAgent:agent,memoryContext:memory.memoryContext,projectId:memory.projectId,conversationId:memory.conversationId,requestId});
 }catch(error){return errorJson('Could not initialize realtime voice.',Number(error?.status)||500,error?.code||'VOICE_REALTIME_FAILED',requestId);}
}
