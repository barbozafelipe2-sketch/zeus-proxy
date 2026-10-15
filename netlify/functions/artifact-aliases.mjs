import { requireUser } from './_shared/auth.mjs';
import { json, readJson, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { withTransaction } from './_shared/db.mjs';
const validAlias=value=>/^[a-z][a-z0-9_-]{1,63}$/.test(String(value||''));
async function handler(req,context){
 const requestId=getRequestId(req,context,null);
 const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
 const {user,db}=auth;
 const url=new URL(req.url);
 const body=req.method==='GET'?null:await readJson(req);
 const projectId=req.method==='GET'?url.searchParams.get('projectId'):body?.projectId;
 if(projectId&&!isUuid(projectId))return errorJson('Invalid project.',400,'INVALID_PROJECT_ID',requestId);
 const scopeKey=projectId||'general';
 if(projectId){
  const [project]=await db.sql`SELECT id FROM projects WHERE id=${projectId} AND owner_id=${user.id}`;
  if(!project)return errorJson('Project not found.',404,'PROJECT_NOT_FOUND',requestId);
 }
 if(req.method==='GET'){
  const aliases=await db.sql`SELECT x.alias,x.artifact_id,x.updated_at,a.filename,a.version,a.type
  FROM artifact_aliases x INNER JOIN artifacts a ON a.id=x.artifact_id
  WHERE x.owner_id=${user.id} AND x.scope_key=${scopeKey} AND a.owner_id=${user.id}
  ORDER BY x.alias LIMIT 100`;
  return json({aliases,requestId});
 }
 if(req.method!=='PUT')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
 const alias=String(body?.alias||'').toLowerCase().trim();
 if(!validAlias(alias)||!isUuid(body?.artifactId))return errorJson('Use a valid alias and artifact ID.',400,'INVALID_ARTIFACT_ALIAS',requestId);
 const result=await withTransaction(db,async client=>{
  const source=(await client.query('SELECT id FROM artifacts WHERE id=$1 AND owner_id=$2 AND project_id IS NOT DISTINCT FROM $3::uuid FOR UPDATE',[body.artifactId,user.id,projectId||null])).rows[0];
  if(!source)return null;
  const row=(await client.query('INSERT INTO artifact_aliases(owner_id,scope_key,alias,artifact_id) VALUES($1,$2,$3,$4) ON CONFLICT(owner_id,scope_key,alias) DO UPDATE SET artifact_id=EXCLUDED.artifact_id,updated_at=now() RETURNING alias,artifact_id,updated_at',[user.id,scopeKey,alias,source.id])).rows[0];
  return row;
 });
 if(!result)return errorJson('Artifact not found in this workspace.',404,'ARTIFACT_SCOPE_MISMATCH',requestId);
 return json({alias:result,requestId});
}
export default async(req,context)=>{
 const id=getRequestId(req,context,null);
 try{return await handler(req,context)}catch(error){console.error('Artifact alias failure',id,error?.message||error);return errorJson('Could not update artifact alias.',500,'ARTIFACT_ALIAS_FAILED',id)}
};
export const config={path:'/api/artifact-aliases'};
