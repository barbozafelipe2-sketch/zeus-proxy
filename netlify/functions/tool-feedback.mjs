import { requireUser } from './_shared/auth.mjs';
import { withTransaction } from './_shared/db.mjs';
import { json, readJson, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { getToolWorkflow, recordToolFeedback } from './_shared/tool-workflows.mjs';

export default async function(req,context){
  const requestId=getRequestId(req,context,null);
  if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
  const {user,db}=auth,body=await readJson(req);
  const isReply=isUuid(body?.messageId)&&['up','down'].includes(body?.value);
  const isArtifact=isUuid(body?.artifactId)&&body?.value==='choose';
  if(!body||(!isReply&&!isArtifact))return errorJson('A valid tool reply or compared artifact is required.',400,'INVALID_TOOL_FEEDBACK',requestId);
  const result=await withTransaction(db,async client=>{
    let toolId='',models=[];
    if(isReply){
      const row=(await client.query(`SELECT m.id,m.metadata,e.trace FROM messages m JOIN executions e ON e.id=m.execution_id AND e.owner_id=m.owner_id WHERE m.id=$1 AND m.owner_id=$2 AND m.role='assistant' FOR UPDATE OF m`,[body.messageId,user.id])).rows[0];
      toolId=String(row?.metadata?.toolId||'');
      if(!toolId||row?.metadata?.toolId!==row?.trace?.toolId)return {error:'TOOL_REPLY_NOT_FOUND'};
      const roles=Array.isArray(row.trace?.roles)?row.trace.roles:[];
      models=roles.map(m=>`${String(m.provider||'')}:${String(m.model||m.id||'')}`).filter(k=>/^[a-z0-9_-]{2,32}:[a-z0-9._/-]{1,100}$/i.test(k)).slice(0,3);
    }else{
      const artifact=(await client.query(`SELECT id,metadata,provenance,execution_id FROM artifacts WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[body.artifactId,user.id])).rows[0];
      toolId=String(artifact?.provenance?.toolId||artifact?.metadata?.toolId||'');
      if(!artifact||!artifact.metadata?.comparePair||!getToolWorkflow(toolId))return {error:'TOOL_COMPARE_ARTIFACT_NOT_FOUND'};
      const modelKey=`${String(artifact.provenance?.provider||'')}:${String(artifact.provenance?.model||'')}`;
      if(/^[a-z0-9_-]{2,32}:[a-z0-9._/-]{1,100}$/i.test(modelKey))models=[modelKey];
    }
    const tool=getToolWorkflow(toolId);
    if(!models.length)return {error:'TOOL_MODEL_TRACE_MISSING'};
    await client.query(`INSERT INTO zeus_user_preferences(owner_id) VALUES($1) ON CONFLICT(owner_id) DO NOTHING`,[user.id]);
    const pref=(await client.query(`SELECT family_preferences FROM zeus_user_preferences WHERE owner_id=$1 FOR UPDATE`,[user.id])).rows[0];
    const next=recordToolFeedback(pref?.family_preferences||{},toolId,models,body.value);
    await client.query(`UPDATE zeus_user_preferences SET family_preferences=$2::jsonb,updated_at=now() WHERE owner_id=$1`,[user.id,JSON.stringify(next)]);
    return {toolId,god:tool.god,ratedModels:models.length,standard:next?.[toolId]?.standard||null};
  });
  if(result.error)return errorJson('This reply is not linked to an eligible tool workflow.',404,result.error,requestId);
  return json({...result,requestId});
}
export const config={path:'/api/tool-feedback'};
