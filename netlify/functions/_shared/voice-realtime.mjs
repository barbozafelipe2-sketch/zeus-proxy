import {requireUser} from './auth.mjs';
import {readJson,json,errorJson,getRequestId} from './http.mjs';
import {consumeEndpointRate} from './limits.mjs';
import {loadVoiceMemoryContext} from './voice-memory-context.mjs';
import {resolveLiveVoiceProvider,issueLiveVoiceCredentials} from './voice-provider.mjs';

// Only intentionally classified application/provider errors may reach the user.
// Raw database/SDK exception text may contain SQL or private implementation details.
export function classifyVoiceStartupError(error,phase='request'){
 const known=Number.isInteger(error?.status)&&error.status>=400&&error.status<=599
  &&typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{2,79}$/.test(error.code);
 if(known)return {status:error.status,code:error.code,message:String(error.message||'Live Talk request rejected.').slice(0,200)};
 const problems={
  memory:{status:503,code:'VOICE_SCOPE_UNAVAILABLE',message:'Live Talk could not verify the current project or conversation. Check the workspace database.'},
  rate:{status:503,code:'VOICE_RATE_STORAGE_UNAVAILABLE',message:'Live Talk request protection is unavailable. Check database migrations and the server log.'},
  credentials:{status:502,code:'VOICE_CREDENTIALS_UNAVAILABLE',message:'The Realtime provider could not create a voice session. Check the server log for this reference.'},
  request:{status:500,code:'VOICE_STARTUP_FAILED',message:'Live Talk could not initialize. Check the server log for this reference.'}
 };
 return problems[phase]||problems.request;
}

export async function voiceRealtimeHandler(req,context,kind,providerOverride=null){
 const requestId=getRequestId(req,context,null);
 if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
 const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
 const {user,db}=auth;
 let phase='request';
 try{
  const body=await readJson(req);
  if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);
  const provider=resolveLiveVoiceProvider(providerOverride||body.provider);
  const agent=body.agent===undefined?'zeus':body.agent;
  if(agent!=='zeus'&&agent!=='athena')return errorJson('Invalid Live Talk agent.',400,'INVALID_AGENT',requestId);
  phase='memory';
  const memory=await loadVoiceMemoryContext(db,user.id,{projectId:body.projectId||null,conversationId:body.conversationId||null,requestId});
  if(memory.error)return errorJson(memory.error.message,memory.error.status,memory.error.code,requestId,{phase});
  phase='rate';
  await consumeEndpointRate(db,user.id,'voice_realtime_session',requestId,60);
  phase='credentials';
  const credentials=await issueLiveVoiceCredentials({provider,agent,kind,voice:body.voice});
  return json({...credentials,voiceProvider:provider,selectedAgent:agent,memoryContext:memory.memoryContext,memoryDegraded:memory.memoryDegraded===true,projectId:memory.projectId,conversationId:memory.conversationId,requestId});
 }catch(error){
  const {status,code,message}=classifyVoiceStartupError(error,phase);
  const detailCode=String(error?.code||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,50);
  console.warn('Live Talk startup failed',{requestId,phase,status,code,detailCode});
  return errorJson(message,status,code,requestId,{phase});
 }
}
