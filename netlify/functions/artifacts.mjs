import { requireUser } from './_shared/auth.mjs';
import { buildArtifact } from './_shared/artifact.mjs';
import { validateArtifactInput } from './_shared/artifact-limits.mjs';
import { json, readJson, cleanText, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { resolveOwnedScope } from './_shared/relations.mjs';
import { pageLimit, decodeCursor, pageResult } from './_shared/pagination.mjs';
import { consumeEndpointRate } from './_shared/limits.mjs';
import { drainBlobGc } from './_shared/storage.mjs';
import { withTransaction } from './_shared/db.mjs';

async function handler(req,context){
  const requestId=getRequestId(req,context,null);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;const{user,db}=auth;
  if(req.method==='GET'){
    const url=new URL(req.url),projectId=url.searchParams.get('projectId');
    if(projectId&&!isUuid(projectId))return errorJson('Invalid project id.',400,'INVALID_PROJECT_ID',requestId);
    if(projectId){const p=await db.sql`SELECT id FROM projects WHERE id=${projectId} AND owner_id=${user.id}`;if(!p.length)return errorJson('Project not found.',404,'PROJECT_NOT_FOUND',requestId);}
    const limit=pageLimit(url.searchParams.get('limit'),60,100);
    const beforeRaw=url.searchParams.get('before'),before=beforeRaw?decodeCursor(beforeRaw):null;
    if(beforeRaw&&!before)return errorJson('Invalid artifact cursor.',400,'INVALID_CURSOR',requestId);
    let rows;
    if(projectId&&before)rows=await db.sql`SELECT id,project_id,conversation_id,type,mime_type,filename,size,version,metadata,created_at FROM artifacts WHERE owner_id=${user.id} AND project_id=${projectId} AND (created_at < ${before.t}::timestamptz OR (created_at = ${before.t}::timestamptz AND id < ${before.id}::uuid)) ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`;
    else if(projectId)rows=await db.sql`SELECT id,project_id,conversation_id,type,mime_type,filename,size,version,metadata,created_at FROM artifacts WHERE owner_id=${user.id} AND project_id=${projectId} ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`;
    else if(before)rows=await db.sql`SELECT id,project_id,conversation_id,type,mime_type,filename,size,version,metadata,created_at FROM artifacts WHERE owner_id=${user.id} AND (created_at < ${before.t}::timestamptz OR (created_at = ${before.t}::timestamptz AND id < ${before.id}::uuid)) ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`;
    else rows=await db.sql`SELECT id,project_id,conversation_id,type,mime_type,filename,size,version,metadata,created_at FROM artifacts WHERE owner_id=${user.id} ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`;
    const paged=pageResult(rows,limit);
    return json({artifacts:paged.page.map(r=>({...r,downloadUrl:`/api/artifact-download?id=${r.id}`})),page:{hasMore:paged.hasMore,nextCursor:paged.nextCursor},requestId});
  }
  if(req.method==='DELETE'){
    const body=await readJson(req);if(!body)return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);
    if(!isUuid(body.id))return errorJson('Valid artifact id required.',400,'INVALID_ARTIFACT_ID',requestId);
    const deleted=await withTransaction(db,async(client)=>{
      const row=(await client.query(`SELECT id,blob_key FROM artifacts WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[body.id,user.id])).rows[0];
      if(!row)return null;
      if(row.blob_key)await client.query(`INSERT INTO blob_gc_queue(owner_id,store_name,blob_key,reason) VALUES($1,'olyhub-artifacts',$2,'artifact-delete') ON CONFLICT(store_name,blob_key) DO NOTHING`,[user.id,row.blob_key]);
      await client.query(`DELETE FROM artifacts WHERE id=$1 AND owner_id=$2`,[body.id,user.id]);
      return row;
    });
    if(!deleted)return errorJson('Artifact not found.',404,'ARTIFACT_NOT_FOUND',requestId);
    let cleanup={attempted:0,deleted:0,failed:0,pending:0};
    try{cleanup=await drainBlobGc(db,user.id,{limit:20});}catch(error){console.warn('Artifact blob cleanup deferred',requestId,error?.message||error);}
    return json({ok:true,deletedId:deleted.id,cleanup,requestId});
  }
  if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  await consumeEndpointRate(db,user.id,'artifact',requestId);
  const body=await readJson(req);if(!body)return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);
  const requestedType=String(body.type||'').toLowerCase();
  if(body.type&&!['pdf','docx','pptx','xlsx','csv','md','zip'].includes(requestedType))return errorJson('Unsupported artifact type.',400,'INVALID_ARTIFACT_TYPE',requestId);
  const type=['pdf','docx','pptx','xlsx','csv','md','zip'].includes(requestedType)?requestedType:'pdf';
  const title=cleanText(body.title,140)||'OlyHub Output',content=cleanText(body.content,120000);if(!content)return errorJson('Artifact content is required.',400,'ARTIFACT_CONTENT_REQUIRED',requestId);
  try{validateArtifactInput(type,content);}catch(error){return errorJson(error.message,Number(error.status)||413,error.code||'ARTIFACT_TOO_LARGE',requestId);}
  let projectId=body.projectId||null,conversationId=body.conversationId||null;
  const scope=await resolveOwnedScope(db,user.id,{projectId,conversationId});
  if(scope.error)return errorJson(scope.error.message,scope.error.status,scope.error.code,requestId);
  projectId=scope.projectId;conversationId=scope.conversationId;
  const artifact=await buildArtifact({db,ownerId:user.id,type,title,content,projectId,conversationId});
  return json({artifact,requestId},201);
}

export default async(req,context)=>{
  const requestId=getRequestId(req,context,null);
  try{return await handler(req,context);}catch(error){console.error('Artifacts API failure',requestId,error?.stack||error?.message||error);const status=Number(error?.status)||500;const code=error?.code||(status>=500?'ARTIFACT_RUNTIME_FAILURE':'ARTIFACT_REQUEST_FAILED');return errorJson(status>=500?'Artifact generation could not complete.':(error?.message||'Artifact request failed.'),status,code,requestId,error?.retryAfter?{retryAfter:error.retryAfter}:{});}
};
export const config={path:'/api/artifacts'};
