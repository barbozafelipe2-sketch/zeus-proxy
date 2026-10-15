import { requireUser } from './_shared/auth.mjs';
import { blobStore } from './_shared/blob.mjs';
import { extractFile } from './_shared/extract.mjs';
import { json, readJson, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { resolveOwnedScope } from './_shared/relations.mjs';
import { queueBlobGc } from './_shared/storage.mjs';
import { consumeEndpointRate } from './_shared/limits.mjs';

// A saved artifact becomes an independent conversation attachment. Never expose
// cross-project objects just because the same account owns both projects.
async function handler(req,context){
  const requestId=getRequestId(req,context,null);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
  const {user,db}=auth;
  if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  const body=await readJson(req);
  if(!body||!isUuid(body.artifactId))return errorJson('Valid artifact ID required.',400,'INVALID_ARTIFACT_ID',requestId);
  let projectId=body.projectId||null,conversationId=body.conversationId||null;
  const scope=await resolveOwnedScope(db,user.id,{projectId,conversationId});
  if(scope.error)return errorJson(scope.error.message,scope.error.status,scope.error.code,requestId);
  projectId=scope.projectId;conversationId=scope.conversationId;
  const [source]=await db.sql`SELECT id,project_id,filename,mime_type,blob_key,size,version
    FROM artifacts WHERE id=${body.artifactId} AND owner_id=${user.id}`;
  if(!source)return errorJson('Artifact not found.',404,'ARTIFACT_NOT_FOUND',requestId);
  if((source.project_id||null)!==(projectId||null))
    return errorJson('This artifact belongs to another workspace. Move or copy it explicitly first.',403,'ARTIFACT_SCOPE_MISMATCH',requestId);
  if(source.size>4*1024*1024)return errorJson('Saved artifact exceeds the current 4 MB analysis attachment limit.',413,'ARTIFACT_ATTACHMENT_TOO_LARGE',requestId);
  await consumeEndpointRate(db,user.id,'upload',requestId);
  const original=await blobStore('olyhub-artifacts').get(source.blob_key,{type:'arrayBuffer'});
  if(!original)return errorJson('Stored artifact is missing.',404,'ARTIFACT_BLOB_MISSING',requestId);
  const bytes=new Uint8Array(original);
  if(bytes.byteLength>4*1024*1024)return errorJson('Saved artifact exceeds the current attachment limit.',413,'ARTIFACT_ATTACHMENT_TOO_LARGE',requestId);
  const extracted=await extractFile(bytes,source.mime_type||'',source.filename||'');
  const meta={extractable:Boolean(extracted.extractable),extractionStatus:extracted.status,
    extractionReason:extracted.reason||null,truncated:Boolean(extracted.truncated),
    sourceArtifactId:source.id,sourceArtifactVersion:source.version};
  const key=`${user.id}/${crypto.randomUUID()}/${source.filename}`;
  await blobStore('olyhub-files').set(key,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  try{
    const [row]=await db.sql`INSERT INTO files
      (owner_id,project_id,conversation_id,filename,mime_type,blob_key,size,status,extracted_text,metadata)
      VALUES(${user.id},${projectId},${conversationId},${source.filename},${source.mime_type},${key},
      ${bytes.byteLength},'READY',${extracted.text||null},${meta})
      RETURNING id,project_id,conversation_id,filename,mime_type,size,status,metadata,created_at`;
    return json({file:{...row,downloadUrl:`/api/file-download?id=${row.id}`,
      previewUrl:meta.extractable?`/api/file-preview?id=${row.id}`:null},requestId},201);
  }catch(error){
    try{await blobStore('olyhub-files').delete(key)}
    catch{try{await queueBlobGc(db,user.id,'olyhub-files',key,'failed-artifact-attach')}catch{}}
    throw error;
  }
}
export default async(req,context)=>{
 const requestId=getRequestId(req,context,null);
 try{return await handler(req,context)}
 catch(error){console.error('Artifact attach error',requestId,error?.message||error);
   return errorJson('Could not attach saved artifact.',500,'ARTIFACT_ATTACH_FAILED',requestId)}
};
export const config={path:'/api/artifact-attach'};
