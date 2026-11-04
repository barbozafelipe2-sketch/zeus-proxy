import {requireUser} from './_shared/auth.mjs';
import {json,readJson,isUuid,getRequestId,errorJson} from './_shared/http.mjs';
import {withTransaction} from './_shared/db.mjs';
export default async function handler(req,context){
 const requestId=getRequestId(req,context,null);
 if(!['GET','POST'].includes(req.method))return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
 const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
 const {user,db}=auth,url=new URL(req.url);
 const body=req.method==='POST'?await readJson(req):null;
 const memoryId=req.method==='GET'?url.searchParams.get('memoryId'):body?.memoryId;
 if(!isUuid(memoryId))return errorJson('Valid memory id required.',400,'INVALID_MEMORY_ID',requestId);
 try{
  if(req.method==='GET'){
   const memories=await db.sql`SELECT id FROM memories WHERE id=${memoryId} AND owner_id=${user.id}`;
   if(!memories.length)return errorJson('Memory not found.',404,'MEMORY_NOT_FOUND',requestId);
   const versions=await db.sql`SELECT id,version,type,content,source,confidence,approved,project_id,changed_at FROM olympus_memory_versions WHERE memory_id=${memoryId} AND owner_id=${user.id} ORDER BY version DESC LIMIT 100`;
   return json({memoryId,versions,requestId});
  }
  const version=body?.version;
  if(!Number.isSafeInteger(version)||version<1)return errorJson('Valid version required.',400,'INVALID_VERSION',requestId);
  const restored=await withTransaction(db,async client=>{
   const current=(await client.query('SELECT id,project_id FROM memories WHERE id=$1 AND owner_id=$2 FOR UPDATE',[memoryId,user.id])).rows[0];
   if(!current)return null;
   const previous=(await client.query('SELECT type,content,source,confidence,approved,project_id FROM olympus_memory_versions WHERE memory_id=$1 AND owner_id=$2 AND version=$3',[memoryId,user.id,version])).rows[0];
   if(!previous)return {missingVersion:true};
   if(String(previous.project_id||'')!==String(current.project_id||''))return {scopeConflict:true};
   const result=await client.query('UPDATE memories SET type=$3,content=$4,source=$5,confidence=$6,approved=$7 WHERE id=$1 AND owner_id=$2 RETURNING id,project_id,type,content,source,confidence,approved',[memoryId,user.id,previous.type,previous.content,previous.source,previous.confidence,previous.approved]);
   return {memory:result.rows[0]};
  });
  if(!restored)return errorJson('Memory not found.',404,'MEMORY_NOT_FOUND',requestId);
  if(restored.missingVersion)return errorJson('Revision not found.',404,'MEMORY_VERSION_NOT_FOUND',requestId);
  if(restored.scopeConflict)return errorJson('Revision belongs to a different project scope.',409,'MEMORY_SCOPE_CONFLICT',requestId);
  return json({restored:true,memory:restored.memory,requestId});
 }catch(error){return errorJson('Could not access memory revision.',500,'MEMORY_VERSION_ERROR',requestId);}
}
export const config={path:'/api/memory-versions'};
