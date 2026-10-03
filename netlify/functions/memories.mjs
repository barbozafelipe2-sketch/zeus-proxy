import { requireUser } from './_shared/auth.mjs';
import { json, readJson, cleanText, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { MEMORY_POLICY } from './_shared/memory.mjs';

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
    const project=await db.sql`SELECT id FROM projects WHERE id=${body.projectId} AND owner_id=${user.id}`;
    if(!project.length)return errorJson('Project not found.',404,'PROJECT_NOT_FOUND',requestId);
    const content=cleanText(body.content,5000);if(!content)return errorJson('Memory content is required.',400,'MEMORY_CONTENT_REQUIRED',requestId);
    const existing=await db.sql`SELECT id FROM memories WHERE owner_id=${user.id} AND project_id=${body.projectId} AND content=${content} LIMIT 1`;
    if(existing.length)return json({memoryId:existing[0].id,duplicate:true,requestId});
    const [memory]=await db.sql`INSERT INTO memories(owner_id,project_id,type,content,source,confidence,approved) VALUES(${user.id},${body.projectId},'manual_note',${content},'manual',100,true) RETURNING id,project_id,type,content,source,confidence,approved,created_at`;
    await db.sql`UPDATE projects SET updated_at=now() WHERE id=${body.projectId} AND owner_id=${user.id}`;
    return json({memory,requestId},201);
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
