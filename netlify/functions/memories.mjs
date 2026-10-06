import { requireUser } from './_shared/auth.mjs';
import { json, readJson, cleanText, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { MEMORY_POLICY } from './_shared/memory.mjs';
import { withTransaction } from './_shared/db.mjs';

async function handler(req,context){
  const requestId=getRequestId(req,context,null);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
  const {user,db}=auth;const url=new URL(req.url);
  if(req.method==='GET'){
    const projectId=url.searchParams.get('projectId');
    if(!isUuid(projectId))return errorJson('Valid project id required.',400,'INVALID_PROJECT_ID',requestId);
    const project=await db.sql`SELECT id FROM projects WHERE id=${projectId} AND owner_id=${user.id}`;
    if(!project.length)return errorJson('Project not found.',404,'PROJECT_NOT_FOUND',requestId);
    const memories=await db.sql`SELECT id,project_id,type,content,source,confidence,approved,created_at FROM memories WHERE owner_id=${user.id} AND project_id=${projectId} AND approved=true ORDER BY created_at DESC LIMIT 200`;
    return json({memories,policy:{candidateLimit:MEMORY_POLICY.candidateLimit,maxItems:MEMORY_POLICY.maxItems,maxChars:MEMORY_POLICY.maxChars,ranking:'type_priority_confidence_recency'},requestId});
  }
  const body=await readJson(req);if(!body)return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);
  if(req.method==='POST'){
    if(!isUuid(body.projectId))return errorJson('Valid project id required.',400,'INVALID_PROJECT_ID',requestId);
    const content=cleanText(body.content,5000);if(!content)return errorJson('Memory content is required.',400,'MEMORY_CONTENT_REQUIRED',requestId);
    const memoryKey=content.replace(/\s+/g,' ').trim().toLowerCase();
    const saved=await withTransaction(db,async client=>{
      const project=(await client.query(`SELECT id FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[body.projectId,user.id])).rows[0];
      if(!project)return {missing:true};
      const existing=(await client.query(`SELECT id FROM memories WHERE owner_id=$1 AND project_id=$2 AND regexp_replace(lower(btrim(content)), E'\\s+', ' ', 'g')=$3 LIMIT 1`,[user.id,body.projectId,memoryKey])).rows[0];
      if(existing)return {duplicate:true,memoryId:existing.id};
      const memory=(await client.query(`INSERT INTO memories(owner_id,project_id,type,content,source,confidence,approved) VALUES($1,$2,'manual_note',$3,'manual',100,true) RETURNING id,project_id,type,content,source,confidence,approved,created_at`,[user.id,body.projectId,content])).rows[0];
      await client.query(`UPDATE projects SET updated_at=now() WHERE id=$1 AND owner_id=$2`,[body.projectId,user.id]);
      return {memory};
    });
    if(saved.missing)return errorJson('Project not found.',404,'PROJECT_NOT_FOUND',requestId);
    if(saved.duplicate)return json({memoryId:saved.memoryId,duplicate:true,requestId});
    return json({memory:saved.memory,requestId},201);
  }
  if(req.method==='DELETE'){
    if(!isUuid(body.id))return errorJson('Valid memory id required.',400,'INVALID_MEMORY_ID',requestId);
    const [deleted]=await db.sql`DELETE FROM memories WHERE id=${body.id} AND owner_id=${user.id} RETURNING project_id`;
    if(!deleted)return errorJson('Memory not found.',404,'MEMORY_NOT_FOUND',requestId);
    if(deleted.project_id)await db.sql`UPDATE projects SET updated_at=now() WHERE id=${deleted.project_id} AND owner_id=${user.id}`;
    return json({ok:true,requestId});
  }
  return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
}

export default async(req,context)=>{
  const requestId=getRequestId(req,context,null);
  try{return await handler(req,context);}catch(error){console.error('Memories API failure',requestId,error?.stack||error?.message||error);return errorJson('Memories could not complete the request.',500,'MEMORIES_RUNTIME_FAILURE',requestId);}
};
export const config={path:'/api/memories'};
