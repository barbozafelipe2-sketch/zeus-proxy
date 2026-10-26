import { requireUser } from './_shared/auth.mjs';
import { withTransaction } from './_shared/db.mjs';
import { json, readJson, isUuid, getRequestId, errorJson, cleanText } from './_shared/http.mjs';
import { queueConversationBlobs, drainBlobGc } from './_shared/storage.mjs';

async function handler(req,context){
  const requestId=getRequestId(req,context,null);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;const{user,db}=auth;
  if(req.method==='PATCH'){
    const body=await readJson(req);
    if(body?.operation==='rename'){
      if(!isUuid(body.conversationId))return errorJson('Valid conversation required.',400,'INVALID_CONVERSATION',requestId);
      const title=cleanText(body.title,120);
      if(!title)return errorJson('Conversation name cannot be empty.',400,'CONVERSATION_TITLE_REQUIRED',requestId);
      const [row]=await db.sql`UPDATE conversations SET title=${title},updated_at=now() WHERE id=${body.conversationId} AND owner_id=${user.id} AND project_id IS NULL RETURNING id,title,project_id,created_at,updated_at`;
      if(!row)return errorJson('Personal conversation not found.',404,'CONVERSATION_NOT_FOUND',requestId);
      return json({conversation:row,requestId});
    }
    if(!body||!isUuid(body.conversationId)||!isUuid(body.projectId))return errorJson('Valid conversation and project required.',400,'INVALID_TRANSFER',requestId);
    if(!['move','copy'].includes(body.operation))return errorJson('Choose move or copy.',400,'INVALID_TRANSFER_OPERATION',requestId);
    const result=await withTransaction(db,async client=>{
      const source=(await client.query('SELECT id,title,project_id FROM conversations WHERE id=$1 AND owner_id=$2 FOR UPDATE',[body.conversationId,user.id])).rows[0];
      if(!source)return {error:'CONVERSATION_NOT_FOUND'};
      const project=(await client.query('SELECT id FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE',[body.projectId,user.id])).rows[0];
      if(!project)return {error:'PROJECT_NOT_FOUND'};
      if(source.project_id===body.projectId)return {error:'ALREADY_IN_PROJECT'};
      // Moving between two existing projects would cross their ownership
      // boundaries. A deliberate export/import flow is required for that.
      if(source.project_id!==null)return {error:'SOURCE_ALREADY_IN_PROJECT'};
      const canonical=(await client.query(
        'SELECT id FROM conversations WHERE owner_id=$1 AND project_id=$2 FOR UPDATE',
        [user.id,body.projectId])).rows[0];
      if(!canonical)return {error:'PROJECT_CONVERSATION_MISSING'};
      const active=(await client.query(
        "SELECT id FROM executions WHERE owner_id=$1 AND conversation_id IN ($2,$3) AND state NOT IN ('COMPLETED','PARTIAL','FAILED','CANCELLED') LIMIT 1",
        [user.id,source.id,canonical.id])).rows;
      if(active.length)return {error:'EXECUTION_ACTIVE'};
      const activeAgentJob=(await client.query("SELECT id FROM code_agent_jobs WHERE owner_id=$1 AND conversation_id=$2 AND status IN ('QUEUED','PLANNING','AWAITING_APPROVAL','RUNNING','COMMITTING') LIMIT 1",[user.id,source.id])).rows[0];
      if(activeAgentJob)return {error:'CODE_AGENT_JOB_ACTIVE'};
      if(body.operation==='move'){
        // The project owns one canonical chat. MERGE the history atomically;
        // do not violate conversations_owner_project_canonical_idx.
        await client.query('UPDATE messages SET conversation_id=$1 WHERE owner_id=$2 AND conversation_id=$3',
          [canonical.id,user.id,source.id]);
        await client.query('UPDATE executions SET conversation_id=$1 WHERE owner_id=$2 AND conversation_id=$3',
          [canonical.id,user.id,source.id]);
        await client.query('UPDATE production_checkpoints SET conversation_id=$1,project_id=$2 WHERE owner_id=$3 AND conversation_id=$4',
          [canonical.id,body.projectId,user.id,source.id]);
        await client.query('UPDATE files SET project_id=$1,conversation_id=$2 WHERE owner_id=$3 AND conversation_id=$4',
          [body.projectId,canonical.id,user.id,source.id]);
        await client.query('UPDATE artifacts SET project_id=$1,conversation_id=$2 WHERE owner_id=$3 AND conversation_id=$4',
          [body.projectId,canonical.id,user.id,source.id]);
        await client.query('UPDATE code_agent_jobs SET project_id=$1,conversation_id=$2,updated_at=now() WHERE owner_id=$3 AND conversation_id=$4',
          [body.projectId,canonical.id,user.id,source.id]);
        await client.query('DELETE FROM conversations WHERE owner_id=$1 AND id=$2',
          [user.id,source.id]);
        await client.query('UPDATE conversations SET updated_at=now() WHERE id=$1 AND owner_id=$2',
          [canonical.id,user.id]);
        await client.query('UPDATE projects SET updated_at=now() WHERE id=$1 AND owner_id=$2',
          [body.projectId,user.id]);
        return {conversationId:canonical.id,projectId:body.projectId,operation:'move',merged:true};
      }
      // Copy shares no binary, artifact or execution identity. We append only
      // text with cleaned metadata to the existing canonical project chat.
      await client.query(
        "INSERT INTO messages(owner_id,conversation_id,role,mode,content,metadata,created_at) SELECT owner_id,$1,role,mode,content,metadata - 'attachments' - 'artifacts' - 'fileIds' - 'artifactIds',created_at FROM messages WHERE owner_id=$2 AND conversation_id=$3 ORDER BY created_at,id",
        [canonical.id,user.id,source.id]);
      await client.query('UPDATE conversations SET updated_at=now() WHERE id=$1 AND owner_id=$2',[canonical.id,user.id]);
      return {conversationId:canonical.id,projectId:body.projectId,operation:'copy',attachmentsCopied:false,merged:true};
    });
    if(result.error)return errorJson('Conversation transfer unavailable.',result.error.endsWith('NOT_FOUND')?404:409,result.error,requestId);
    return json({...result,requestId});
  }
  if(req.method==='DELETE'){
    const body=await readJson(req);
    if(!body||!isUuid(body.conversationId))return errorJson('Valid conversation required.',400,'INVALID_CONVERSATION',requestId);
    const deleted=await withTransaction(db,async client=>{
      const conversation=(await client.query('SELECT id,project_id FROM conversations WHERE id=$1 AND owner_id=$2 FOR UPDATE',[body.conversationId,user.id])).rows[0];
      if(!conversation)return {error:'CONVERSATION_NOT_FOUND'};
      if(conversation.project_id)return {error:'PROJECT_CHAT_DELETE_VIA_PROJECT'};
      const running=(await client.query("SELECT id FROM executions WHERE owner_id=$1 AND conversation_id=$2 AND state NOT IN ('COMPLETED','PARTIAL','FAILED','CANCELLED') LIMIT 1",[user.id,conversation.id])).rows[0];
      if(running)return {error:'EXECUTION_ACTIVE'};
      const activeJob=(await client.query("SELECT id FROM code_agent_jobs WHERE owner_id=$1 AND conversation_id=$2 AND status IN ('QUEUED','PLANNING','AWAITING_APPROVAL','RUNNING','COMMITTING') LIMIT 1",[user.id,conversation.id])).rows[0];
      if(activeJob)return {error:'CODE_AGENT_JOB_ACTIVE'};
      const queued=await queueConversationBlobs(client,user.id,conversation.id);
      await client.query('DELETE FROM code_agent_jobs WHERE owner_id=$1 AND conversation_id=$2',[user.id,conversation.id]);
      await client.query('DELETE FROM files WHERE owner_id=$1 AND conversation_id=$2',[user.id,conversation.id]);
      await client.query('DELETE FROM artifacts WHERE owner_id=$1 AND conversation_id=$2',[user.id,conversation.id]);
      await client.query('DELETE FROM conversations WHERE owner_id=$1 AND id=$2',[user.id,conversation.id]);
      return {id:conversation.id,queued};
    });
    if(deleted.error){const status=deleted.error==='CONVERSATION_NOT_FOUND'?404:409;return errorJson('Conversation could not be deleted.',status,deleted.error,requestId);}
    let cleanup={attempted:0,deleted:0,failed:0,pending:deleted.queued};
    try{cleanup=await drainBlobGc(db,user.id,{limit:Math.min(100,Math.max(10,deleted.queued||0))});}catch(error){console.warn('Conversation blob cleanup deferred',requestId,error?.message||error);}
    return json({ok:true,cleanup,requestId});
  }
  if(req.method!=='GET')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  const rows=await db.sql`SELECT c.id,c.title,c.project_id,c.created_at,c.updated_at,(SELECT content FROM messages m WHERE m.conversation_id=c.id AND m.role='assistant' ORDER BY created_at DESC LIMIT 1) AS preview FROM conversations c WHERE c.owner_id=${user.id} ORDER BY c.updated_at DESC LIMIT 80`;
  return json({conversations:rows,requestId});
}

export default async(req,context)=>{
  const requestId=getRequestId(req,context,null);
  try{return await handler(req,context);}catch(error){console.error('Conversations API failure',requestId,error?.stack||error?.message||error);return errorJson('Conversations could not be loaded.',500,'CONVERSATIONS_RUNTIME_FAILURE',requestId);}
};
export const config={path:'/api/conversations'};
