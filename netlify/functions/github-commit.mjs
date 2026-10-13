import { requireUser } from './_shared/auth.mjs';
import { json, readJson, cleanText, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { blobStore } from './_shared/blob.mjs';
import { consumeEndpointRate } from './_shared/limits.mjs';
import { commitZipToGitHub } from './_shared/github-write.mjs';

async function handler(req,context){
  const requestId=getRequestId(req,context,null);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;const {user,db}=auth;
  if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  const body=await readJson(req);if(!body)return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);
  if(body.confirm!==true)return errorJson('GitHub commit requires explicit owner confirmation.',409,'GITHUB_CONFIRMATION_REQUIRED',requestId);
  const sourceKind=body.sourceKind==='file'?'file':'artifact',sourceId=body.sourceId;
  if(!isUuid(sourceId))return errorJson('Choose a valid ZIP source.',400,'INVALID_SOURCE_ID',requestId);
  const repoUrl=cleanText(body.repoUrl,500);if(!repoUrl)return errorJson('GitHub repository URL is required.',400,'GITHUB_REPO_URL_REQUIRED',requestId);
  const branch=cleanText(body.branch,120),message=cleanText(body.message,180);
  const rows=sourceKind==='file'
    ?await db.sql`SELECT id,filename,mime_type,blob_key FROM files WHERE id=${sourceId} AND owner_id=${user.id} LIMIT 1`
    :await db.sql`SELECT id,filename,mime_type,blob_key,type FROM artifacts WHERE id=${sourceId} AND owner_id=${user.id} LIMIT 1`;
  const row=rows[0];if(!row)return errorJson('ZIP source not found.',404,'SOURCE_NOT_FOUND',requestId);
  if(!row.blob_key||!(/zip/i.test(row.mime_type||'')||String(row.filename||'').toLowerCase().endsWith('.zip')||row.type==='zip'))return errorJson('Only ZIP project packages can be committed to GitHub.',415,'GITHUB_SOURCE_NOT_ZIP',requestId);
  await consumeEndpointRate(db,user.id,'github_commit',requestId,20);
  const bytes=await blobStore(sourceKind==='file'?'olyhub-files':'olyhub-artifacts').get(row.blob_key,{type:'arrayBuffer'});
  if(!bytes)return errorJson('ZIP source bytes are unavailable.',410,'SOURCE_BLOB_MISSING',requestId);
  const commit=await commitZipToGitHub({repoUrl,branch,message,zipBytes:new Uint8Array(bytes),requestId});
  return json({ok:true,commit,source:{id:row.id,kind:sourceKind,filename:row.filename},requestId},201);
}
export default async(req,context)=>{
  const requestId=getRequestId(req,context,null);
  try{return await handler(req,context);}catch(error){
    console.error('GitHub commit failure',requestId,error?.code||error?.message||error);
    const status=Number(error?.status)||500,code=error?.code||(status>=500?'GITHUB_COMMIT_RUNTIME_FAILURE':'GITHUB_COMMIT_FAILED');
    return errorJson(error?.message||'GitHub commit failed.',status,code,requestId,error?.details?{details:error.details}:{});
  }
};
export const config={path:'/api/github-commit'};
