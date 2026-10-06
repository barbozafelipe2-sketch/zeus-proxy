import { requireUser } from './_shared/auth.mjs';
import { blobStore } from './_shared/blob.mjs';
import { extractFile } from './_shared/extract.mjs';
import { json, readJson, isUuid, safeFilename, getRequestId, errorJson } from './_shared/http.mjs';
import { resolveOwnedScope } from './_shared/relations.mjs';
import { pageLimit, decodeCursor, pageResult } from './_shared/pagination.mjs';
import { consumeEndpointRate } from './_shared/limits.mjs';
import { queueBlobGc, drainBlobGc } from './_shared/storage.mjs';
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
    if(beforeRaw&&!before)return errorJson('Invalid file cursor.',400,'INVALID_CURSOR',requestId);
    let rows;
    if(projectId&&before)rows=await db.sql`SELECT id,project_id,conversation_id,filename,mime_type,size,status,metadata,created_at FROM files WHERE owner_id=${user.id} AND project_id=${projectId} AND (created_at < ${before.t}::timestamptz OR (created_at = ${before.t}::timestamptz AND id < ${before.id}::uuid)) ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`;
    else if(projectId)rows=await db.sql`SELECT id,project_id,conversation_id,filename,mime_type,size,status,metadata,created_at FROM files WHERE owner_id=${user.id} AND project_id=${projectId} ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`;
    else if(before)rows=await db.sql`SELECT id,project_id,conversation_id,filename,mime_type,size,status,metadata,created_at FROM files WHERE owner_id=${user.id} AND (created_at < ${before.t}::timestamptz OR (created_at = ${before.t}::timestamptz AND id < ${before.id}::uuid)) ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`;
    else rows=await db.sql`SELECT id,project_id,conversation_id,filename,mime_type,size,status,metadata,created_at FROM files WHERE owner_id=${user.id} ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`;
    const paged=pageResult(rows,limit);
    return json({files:paged.page.map(r=>({...r,downloadUrl:`/api/file-download?id=${r.id}`,previewUrl:r.metadata?.extractable?`/api/file-preview?id=${r.id}`:null})),page:{hasMore:paged.hasMore,nextCursor:paged.nextCursor},requestId});
  }
  if(req.method==='DELETE'){
    const body=await readJson(req);if(!body)return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);
    if(!isUuid(body.id))return errorJson('Valid file id required.',400,'INVALID_FILE_ID',requestId);
    const deleted=await withTransaction(db,async(client)=>{
      const row=(await client.query(`SELECT id,blob_key FROM files WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[body.id,user.id])).rows[0];
      if(!row)return null;
      if(row.blob_key)await client.query(`INSERT INTO blob_gc_queue(owner_id,store_name,blob_key,reason) VALUES($1,'olyhub-files',$2,'file-delete') ON CONFLICT(store_name,blob_key) DO NOTHING`,[user.id,row.blob_key]);
      await client.query(`DELETE FROM files WHERE id=$1 AND owner_id=$2`,[body.id,user.id]);
      return row;
    });
    if(!deleted)return errorJson('File not found.',404,'FILE_NOT_FOUND',requestId);
    let cleanup={attempted:0,deleted:0,failed:0,pending:0};
    try{cleanup=await drainBlobGc(db,user.id,{limit:20});}catch(error){console.warn('File blob cleanup deferred',requestId,error?.message||error);}
    return json({ok:true,deletedId:deleted.id,cleanup,requestId});
  }
  if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  await consumeEndpointRate(db,user.id,'upload',requestId);
  let form;try{form=await req.formData();}catch{return errorJson('Upload a valid file.',400,'INVALID_UPLOAD',requestId);}
  const file=form.get('file');
  if(!(file instanceof File))return errorJson('A file is required.',400,'FILE_REQUIRED',requestId);
  if(file.size>4*1024*1024)return errorJson('File exceeds the safe 4 MB buffered upload limit. Use a smaller file or split the source archive.',413,'FILE_TOO_LARGE',requestId);
  let projectId=form.get('projectId')||null,conversationId=form.get('conversationId')||null;
  const scope=await resolveOwnedScope(db,user.id,{projectId,conversationId});
  if(scope.error)return errorJson(scope.error.message,scope.error.status,scope.error.code,requestId);
  projectId=scope.projectId;conversationId=scope.conversationId;
  const filename=safeFilename(file.name),mime=file.type||'application/octet-stream';
  const requestedRole=String(form.get('analysisRole')||'').slice(0,40);const analysisRole=['media_image','video_source','video_frame'].includes(requestedRole)?requestedRole:null;
  const sourceName=form.get('sourceName')?safeFilename(String(form.get('sourceName')).slice(0,180)):null;
  const buf=new Uint8Array(await file.arrayBuffer());
  const key=`${user.id}/${crypto.randomUUID()}/${filename}`;
  const store=blobStore('olyhub-files');
  await store.set(key,buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
  try{
    const extraction=await extractFile(buf,mime,filename);
    const metadata={extractable:Boolean(extraction.extractable),extractionStatus:extraction.status,extractionReason:extraction.reason||null,truncated:Boolean(extraction.truncated),analysisRole,sourceName};
    const [row]=await db.sql`INSERT INTO files(owner_id,project_id,conversation_id,filename,mime_type,blob_key,size,status,extracted_text,metadata) VALUES(${user.id},${projectId},${conversationId},${filename},${mime},${key},${file.size},'READY',${extraction.text||null},${metadata}) RETURNING id,project_id,conversation_id,filename,mime_type,size,status,metadata,created_at`;
    return json({file:{...row,downloadUrl:`/api/file-download?id=${row.id}`,previewUrl:metadata.extractable?`/api/file-preview?id=${row.id}`:null,extracted:metadata.extractable,analysisStatus:extraction.status},requestId},201);
  }catch(error){try{await store.delete(key);}catch{try{await queueBlobGc(db,user.id,'olyhub-files',key,'failed-upload');}catch{}}throw error;}
}

export default async(req,context)=>{
  const requestId=getRequestId(req,context,null);
  try{return await handler(req,context);}catch(error){console.error('Files API failure',requestId,error?.stack||error?.message||error);const status=Number(error?.status)||500;const code=error?.code||(status>=500?'FILES_RUNTIME_FAILURE':'FILES_REQUEST_FAILED');return errorJson(status>=500?'Files could not complete the request.':(error?.message||'Files request failed.'),status,code,requestId,error?.retryAfter?{retryAfter:error.retryAfter}:{});}
};
export const config={path:'/api/files'};
