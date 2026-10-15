import { requireUser } from './_shared/auth.mjs';
import { json, readJson, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { stageArtifact, discardStagedArtifact } from './_shared/artifact.mjs';
import { queueBlobGc } from './_shared/storage.mjs';
import { withTransaction } from './_shared/db.mjs';
import { consumeEndpointRate } from './_shared/limits.mjs';

async function handler(req,context){
 const id=getRequestId(req,context,null),auth=await requireUser(req,id);if(auth.error)return auth.error;
 if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',id);
 const body=await readJson(req);
 if(!body||!isUuid(body.parentArtifactId))return errorJson('Valid original artifact required.',400,'INVALID_PARENT_ARTIFACT',id);
 const {user,db}=auth;
 const content=String(body.content||'');
 if(!content.trim()||content.length>120000)return errorJson('HTML content must be 1–120,000 characters.',413,'REVISION_TOO_LARGE',id);
 const [source]=await db.sql`SELECT id,project_id,conversation_id,type,filename,version
   FROM artifacts WHERE id=${body.parentArtifactId} AND owner_id=${user.id}`;
 if(!source||source.type!=='html')return errorJson('HTML artifact not found.',404,'REVISION_SOURCE_NOT_FOUND',id);
 // The target workspace is ALWAYS inherited from the original, not user input.
 await consumeEndpointRate(db,user.id,'artifact',id);
 const title=String(source.filename||'Preview').replace(/\.html$/i,'').slice(0,100);
 const staged=await stageArtifact({ownerId:user.id,type:'html',title,content,
  metadata:{title,parentArtifactId:source.id,revision:true},
  provenance:{sourceArtifactId:source.id,operation:'html_revision'}});
 try{
  const saved=await withTransaction(db,async client=>{
   const parent=(await client.query('SELECT id,owner_id,project_id,conversation_id,version,type FROM artifacts WHERE id=$1 AND owner_id=$2 FOR UPDATE',[source.id,user.id])).rows[0];
   if(!parent||parent.type!=='html')return null;
   const next=Number(parent.version||1)+1;
   const row=(await client.query('INSERT INTO artifacts(owner_id,project_id,conversation_id,parent_artifact_id,type,mime_type,filename,blob_key,size,version,metadata,provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,project_id,conversation_id,parent_artifact_id,type,mime_type,filename,size,version,created_at',
    [user.id,parent.project_id,parent.conversation_id,parent.id,staged.type,staged.mimeType,staged.filename,staged.blobKey,staged.size,next,staged.metadata,staged.provenance])).rows[0];
   return row;
  });
  if(!saved)throw Object.assign(new Error('Original artifact changed before revision saved.'),{code:'REVISION_PARENT_MISSING',status:409});
  return json({artifact:{...saved,downloadUrl:`/api/artifact-download?id=${saved.id}`},requestId:id},201);
 }catch(error){
  const removed=await discardStagedArtifact(staged);
  if(!removed){try{await queueBlobGc(db,user.id,'olyhub-artifacts',staged.blobKey,'revision-failed')}catch{}}
  throw error;
 }
}
export default async(req,context)=>{const id=getRequestId(req,context,null);try{return await handler(req,context)}catch(error){console.error('Artifact revision failed',id,error?.message||error);return errorJson('Could not save artifact revision.',500,'ARTIFACT_REVISION_FAILED',id)}};
export const config={path:'/api/artifact-revise'};
