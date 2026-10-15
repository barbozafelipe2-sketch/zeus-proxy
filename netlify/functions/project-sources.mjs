import { requireUser } from './_shared/auth.mjs';
import { json, readJson, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { withTransaction } from './_shared/db.mjs';
async function handler(req,context){
  const requestId=getRequestId(req,context,null);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
  const {db,user}=auth,body=req.method==='GET'?null:await readJson(req);
  const projectId=req.method==='GET'?new URL(req.url).searchParams.get('projectId'):body?.projectId;
  if(!isUuid(projectId))return errorJson('Valid project id required.',400,'INVALID_PROJECT_ID',requestId);
  const [project]=await db.sql`SELECT id FROM projects WHERE id=${projectId} AND owner_id=${user.id}`;
  if(!project)return errorJson('Project not found.',404,'PROJECT_NOT_FOUND',requestId);
  if(req.method==='GET'){
    const sources=await db.sql`SELECT id,title,content,revision,source_file_id,active,updated_at FROM project_sources WHERE owner_id=${user.id} AND project_id=${projectId} AND active=true ORDER BY updated_at DESC LIMIT 40`;
    return json({sources,requestId});
  }
  if(!body)return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);
  if(req.method==='DELETE'){
    if(!isUuid(body.id))return errorJson('Valid source id required.',400,'INVALID_SOURCE_ID',requestId);
    const [row]=await db.sql`UPDATE project_sources SET active=false,updated_at=now() WHERE id=${body.id} AND owner_id=${user.id} AND project_id=${projectId} RETURNING id`;
    if(!row)return errorJson('Source not found.',404,'SOURCE_NOT_FOUND',requestId);
    return json({ok:true,id:row.id,requestId});
  }
  if(req.method!=='POST'&&req.method!=='PUT')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  const title=String(body.title||'').trim().slice(0,140),content=String(body.content||'').trim();
  if(!title||!content||content.length>20000)return errorJson('A title and content (max 20,000 characters) are required.',400,'INVALID_SOURCE',requestId);
  if(body.sourceFileId&&!isUuid(body.sourceFileId))return errorJson('Invalid source file.',400,'INVALID_SOURCE_FILE',requestId);
  const result=await withTransaction(db,async client=>{
    if(body.sourceFileId){
      const f=(await client.query('SELECT id FROM files WHERE id=$1 AND owner_id=$2 AND project_id=$3',[body.sourceFileId,user.id,projectId])).rows[0];
      if(!f)return {error:'SOURCE_FILE_NOT_IN_PROJECT'};
    }
    if(req.method==='PUT'){
      if(!isUuid(body.id))return {error:'INVALID_SOURCE_ID'};
      const saved=(await client.query('UPDATE project_sources SET title=$1,content=$2,revision=revision+1,source_file_id=$3,updated_at=now() WHERE id=$4 AND owner_id=$5 AND project_id=$6 AND active=true RETURNING id,title,content,revision,updated_at',[title,content,body.sourceFileId||null,body.id,user.id,projectId])).rows[0];
      return saved?{source:saved}:{error:'SOURCE_NOT_FOUND'};
    }
    const source=(await client.query('INSERT INTO project_sources(owner_id,project_id,title,content,source_file_id) VALUES($1,$2,$3,$4,$5) RETURNING id,title,content,revision,updated_at',[user.id,projectId,title,content,body.sourceFileId||null])).rows[0];
    return {source};
  });
  if(result.error)return errorJson('Source modification rejected.',result.error==='SOURCE_NOT_FOUND'?404:400,result.error,requestId);
  return json({...result,requestId},req.method==='POST'?201:200);
}
export default async(req,context)=>{const requestId=getRequestId(req,context,null);try{return await handler(req,context);}catch(e){console.error('Project source error',requestId,e?.message);return errorJson('Project source request failed.',500,'PROJECT_SOURCE_FAILED',requestId);}};
export const config={path:'/api/project-sources'};
