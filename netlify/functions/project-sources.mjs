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
    const sources=await db.sql`SELECT s.id,s.title,s.content,s.revision,s.source_file_id,f.filename AS source_file_name,f.mime_type AS source_file_mime_type,s.active,s.updated_at FROM project_sources s LEFT JOIN files f ON f.id=s.source_file_id AND f.owner_id=s.owner_id AND f.project_id=s.project_id WHERE s.owner_id=${user.id} AND s.project_id=${projectId} AND s.active=true ORDER BY s.updated_at DESC LIMIT 40`;
    const ids=sources.map(s=>s.id);
    const versions=ids.length?await db.sql`SELECT source_id,title,content,revision,source_file_id,created_at FROM project_source_versions WHERE owner_id=${user.id} AND project_id=${projectId} AND source_id=ANY(${ids}) ORDER BY source_id,revision DESC`:[];
    const bySource=new Map();for(const version of versions){const list=bySource.get(version.source_id)||[];list.push(version);bySource.set(version.source_id,list);}
    return json({sources:sources.map(s=>({...s,versions:bySource.get(s.id)||[]})),requestId});
  }
  if(!body)return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);
  if(req.method==='DELETE'){
    if(!isUuid(body.id))return errorJson('Valid source id required.',400,'INVALID_SOURCE_ID',requestId);
    const [row]=await db.sql`UPDATE project_sources SET active=false,updated_at=now() WHERE id=${body.id} AND owner_id=${user.id} AND project_id=${projectId} RETURNING id`;
    if(!row)return errorJson('Source not found.',404,'SOURCE_NOT_FOUND',requestId);
    return json({ok:true,id:row.id,requestId});
  }
  if(req.method!=='POST'&&req.method!=='PUT')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  const title=String(body.title||'').trim().slice(0,140),submittedContent=String(body.content||'').trim();
  if(!title||submittedContent.length>20000)return errorJson('A title is required; pasted content must be at most 20,000 characters.',400,'INVALID_SOURCE',requestId);
  if(body.sourceFileId&&!isUuid(body.sourceFileId))return errorJson('Invalid source file.',400,'INVALID_SOURCE_FILE',requestId);
  const result=await withTransaction(db,async client=>{
    let content=submittedContent;
    if(body.sourceFileId){
      const f=(await client.query('SELECT id,filename,extracted_text FROM files WHERE id=$1 AND owner_id=$2 AND project_id=$3',[body.sourceFileId,user.id,projectId])).rows[0];
      if(!f)return {error:'SOURCE_FILE_NOT_IN_PROJECT'};
      if(!submittedContent&&!String(f.extracted_text||'').trim())return {error:'SOURCE_FILE_NOT_EXTRACTABLE'};
      if(!submittedContent)content=String(f.extracted_text).trim().slice(0,20000);
    }
    if(!content)return {error:'SOURCE_CONTENT_REQUIRED'};
    if(req.method==='PUT'){
      if(!isUuid(body.id))return {error:'INVALID_SOURCE_ID'};
      const saved=(await client.query('UPDATE project_sources SET title=$1,content=$2,revision=revision+1,source_file_id=$3,updated_at=now() WHERE id=$4 AND owner_id=$5 AND project_id=$6 AND active=true RETURNING id,title,content,revision,source_file_id,updated_at',[title,content,body.sourceFileId||null,body.id,user.id,projectId])).rows[0];
      if(saved)await client.query('INSERT INTO project_source_versions(owner_id,project_id,source_id,title,content,revision,source_file_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(source_id,revision) DO NOTHING',[user.id,projectId,saved.id,saved.title,saved.content,saved.revision,saved.source_file_id]);
      return saved?{source:saved}:{error:'SOURCE_NOT_FOUND'};
    }
    const source=(await client.query('INSERT INTO project_sources(owner_id,project_id,title,content,source_file_id) VALUES($1,$2,$3,$4,$5) RETURNING id,title,content,revision,source_file_id,updated_at',[user.id,projectId,title,content,body.sourceFileId||null])).rows[0];
    await client.query('INSERT INTO project_source_versions(owner_id,project_id,source_id,title,content,revision,source_file_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(source_id,revision) DO NOTHING',[user.id,projectId,source.id,source.title,source.content,source.revision,source.source_file_id]);
    return {source};
  });
  if(result.error){
    const message=result.error==='SOURCE_FILE_NOT_EXTRACTABLE'?'This project file has no extracted text. Paste the approved text or choose a text-readable file.':result.error==='SOURCE_CONTENT_REQUIRED'?'Paste source content or link a project file with extracted text.':'Source modification rejected.';
    return errorJson(message,result.error==='SOURCE_NOT_FOUND'?404:400,result.error,requestId);
  }
  return json({...result,requestId},req.method==='POST'?201:200);
}
export default async(req,context)=>{const requestId=getRequestId(req,context,null);try{return await handler(req,context);}catch(e){console.error('Project source error',requestId,e?.message);return errorJson('Project source request failed.',500,'PROJECT_SOURCE_FAILED',requestId);}};
export const config={path:'/api/project-sources'};
