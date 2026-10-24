import { requireUser } from './_shared/auth.mjs';
import { json, readJson, cleanText, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { consumeEndpointRate } from './_shared/limits.mjs';
import { resolveOwnedScope } from './_shared/relations.mjs';

async function handler(req,context){
  const requestId=getRequestId(req,context,null);
  if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
  const {user,db}=auth;
  try{
    const body=await readJson(req),role=body?.role==='user'?'user':body?.role==='assistant'?'assistant':'';
    const content=cleanText(body?.content,8000),eventId=String(body?.eventId||'').slice(0,80);
    const providerConversationId=String(body?.providerConversationId||'').slice(0,100);
    if(!role||!content||!eventId||!providerConversationId)return errorJson('A voice transcript event is incomplete.',400,'VOICE_TRANSCRIPT_INVALID',requestId);
    const scope=await resolveOwnedScope(db,user.id,{projectId:body?.projectId||null,conversationId:body?.conversationId||null});
    if(scope.error)return errorJson(scope.error.message,scope.error.status,scope.error.code,requestId);
    await consumeEndpointRate(db,user.id,'voice_realtime_log',requestId,600);
    let conversationId=scope.conversationId;
    if(!conversationId){
      if(scope.projectId){
        const rows=await db.sql`INSERT INTO conversations(owner_id,project_id,title) VALUES(${user.id},${scope.projectId},'Live Talk') ON CONFLICT (owner_id,project_id) WHERE project_id IS NOT NULL DO UPDATE SET updated_at=conversations.updated_at RETURNING id`;
        conversationId=rows[0]?.id;
      }else{
        const rows=await db.sql`INSERT INTO conversations(owner_id,project_id,title) VALUES(${user.id},NULL,'Live Talk') RETURNING id`;
        conversationId=rows[0]?.id;
      }
    }
    const prior=await db.sql`SELECT id FROM messages WHERE owner_id=${user.id} AND conversation_id=${conversationId} AND role=${role} AND metadata->>'source'='elevenlabs_realtime' AND metadata->>'providerConversationId'=${providerConversationId} AND metadata->>'eventId'=${eventId} LIMIT 1`;
    let message;
    if(prior.length){
      const rows=await db.sql`UPDATE messages SET content=${content} WHERE id=${prior[0].id} AND owner_id=${user.id} RETURNING id,execution_id,role,mode,content,metadata,created_at`;
      message=rows[0];
    }else{
      const rows=await db.sql`INSERT INTO messages(owner_id,conversation_id,role,mode,content,metadata) VALUES(${user.id},${conversationId},${role},'ZEUS',${content},${JSON.stringify({source:'elevenlabs_realtime',providerConversationId,eventId})}::jsonb) RETURNING id,execution_id,role,mode,content,metadata,created_at`;
      message=rows[0];
    }
    await db.sql`UPDATE conversations SET updated_at=now() WHERE id=${conversationId} AND owner_id=${user.id}`;
    return json({conversationId,message,requestId});
  }catch(error){
    const status=Number(error?.status)||500;
    return errorJson(error?.message||'Could not save the Live Talk transcript.',status,error?.code||'VOICE_TRANSCRIPT_SAVE_FAILED',requestId,error?.retryAfter?{retryAfter:error.retryAfter}:{});
  }
}

export default async(req,context)=>handler(req,context);
export const config={path:'/api/voice-log'};
