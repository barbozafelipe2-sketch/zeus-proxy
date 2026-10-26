import { createHash } from 'node:crypto';
import { blobStore } from './blob.mjs';
import { dangerousPath } from './github-write.mjs';
import { safeZipPath } from './zip-output.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_ID=/^[A-Za-z0-9_.:-]{1,160}$/;
export const CODE_AGENT_WORKSPACE_STORE='olyhub-code-workspaces';
export const CODE_AGENT_WORKSPACE_MAX_FILES=200;
export const CODE_AGENT_WORKSPACE_MAX_BYTES=12*1024*1024;

function workspaceError(message,status=422,code='CODE_AGENT_WORKSPACE_INVALID'){
  return Object.assign(new Error(message),{status,code});
}
function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
function normalizeFiles(files){
  if(!Array.isArray(files)||!files.length||files.length>CODE_AGENT_WORKSPACE_MAX_FILES)
    throw workspaceError(`Workspace must contain between 1 and ${CODE_AGENT_WORKSPACE_MAX_FILES} files.`);
  const seen=new Set();let totalBytes=0;
  const normalized=files.map(file=>{
    const rawPath=String(file?.path||'').trim(),path=safeZipPath(rawPath);
    if(!path||path!==rawPath||dangerousPath(path))throw workspaceError(`Workspace contains an unsafe path: ${rawPath.slice(0,180)}`);
    if(seen.has(path))throw workspaceError(`Workspace contains a duplicate path: ${path}`);
    seen.add(path);
    let encoding,content,bytes;
    if(typeof file?.content==='string'){
      encoding='utf8';content=file.content;bytes=Buffer.from(content,'utf8');
    }else if(file?.content instanceof Uint8Array||Buffer.isBuffer(file?.content)){
      encoding='base64';bytes=Buffer.from(file.content);content=bytes.toString('base64');
    }else throw workspaceError(`Workspace file has no supported content: ${path}`);
    totalBytes+=bytes.byteLength;
    if(bytes.byteLength>2*1024*1024||totalBytes>CODE_AGENT_WORKSPACE_MAX_BYTES)
      throw workspaceError('Workspace snapshot exceeds the safe 12 MB source limit.',413,'CODE_AGENT_WORKSPACE_TOO_LARGE');
    const mode=String(file?.mode||'100644');
    if(!['100644','100755'].includes(mode))throw workspaceError(`Unsupported file mode for ${path}.`);
    return {path,encoding,content,mode,sha256:sha256(bytes),size:bytes.byteLength};
  });
  return {files:normalized,totalBytes};
}
function normalizeDeletedPaths(paths=[]){
  if(!Array.isArray(paths)||paths.length>CODE_AGENT_WORKSPACE_MAX_FILES)throw workspaceError('Workspace deletion list is invalid.');
  return [...new Set(paths.map(raw=>{const value=String(raw||'').trim(),path=safeZipPath(value);if(!path||path!==value||dangerousPath(path))throw workspaceError(`Workspace contains an unsafe deleted path: ${value.slice(0,180)}`);return path;}))];
}

// Persist immutable, versioned source snapshots. Netlify Function disk is
// temporary; each worker can hydrate this snapshot into its own /tmp workspace.
export async function saveCodeAgentWorkspaceSnapshot({ownerId,jobId,workerToken,files,deletedPaths=[],db,blobStoreImpl=blobStore(CODE_AGENT_WORKSPACE_STORE)}){
  if(!OWNER_ID.test(String(ownerId||''))||!UUID.test(String(jobId||''))||!UUID.test(String(workerToken||'')))throw workspaceError('Workspace owner, job and worker ids are invalid.',400);
  if(!db)throw workspaceError('A database connection is required.',500,'CODE_AGENT_WORKSPACE_DB_REQUIRED');
  const normalized=normalizeFiles(files);
  const revision=globalThis.crypto.randomUUID();
  const key=`${ownerId}/${jobId}/${revision}.json`;
  const deletions=normalizeDeletedPaths(deletedPaths),snapshot={version:1,ownerId,jobId,createdAt:new Date().toISOString(),files:normalized.files,deletedPaths:deletions};
  const serialized=JSON.stringify(snapshot);
  await blobStoreImpl.set(key,serialized);
  try{
    const result=await db.sql`
      UPDATE code_agent_jobs SET workspace_blob_key=${key},workspace_manifest=${JSON.stringify(normalized.files.map(({path,encoding,mode,sha256,size})=>({path,encoding,mode,sha256,size})))}::jsonb,
        base_workspace_blob_key=COALESCE(base_workspace_blob_key,${key}),
        base_workspace_manifest=CASE WHEN base_workspace_blob_key IS NULL THEN ${JSON.stringify(normalized.files.map(({path,encoding,mode,sha256,size})=>({path,encoding,mode,sha256,size})))}::jsonb ELSE base_workspace_manifest END,
        updated_at=now()
      WHERE id=${jobId} AND owner_id=${ownerId} AND worker_token=${workerToken}::uuid
        AND lease_expires_at>now() AND status IN ('PLANNING','RUNNING','COMMITTING') RETURNING id`;
    if(result.length!==1)throw workspaceError('Workspace owner lease expired before the snapshot could be attached.',409,'CODE_AGENT_LEASE_CONFLICT');
  }catch(error){
    try{await blobStoreImpl.delete(key);}catch{}
    throw error;
  }
  return {key,fileCount:normalized.files.length,totalBytes:normalized.totalBytes,manifest:snapshot.files.map(({path,encoding,mode,sha256,size})=>({path,encoding,mode,sha256,size})),deletedPaths:deletions};
}

export async function loadCodeAgentWorkspaceSnapshot({ownerId,jobId,blobKey,blobStoreImpl=blobStore(CODE_AGENT_WORKSPACE_STORE)}){
  if(!OWNER_ID.test(String(ownerId||''))||!UUID.test(String(jobId||'')))throw workspaceError('Workspace owner and job ids are invalid.',400);
  if(typeof blobKey!=='string'||!blobKey.startsWith(`${ownerId}/${jobId}/`)||!blobKey.endsWith('.json'))
    throw workspaceError('Workspace snapshot key is outside this job scope.',403,'CODE_AGENT_WORKSPACE_SCOPE_MISMATCH');
  const raw=await blobStoreImpl.get(blobKey);
  if(typeof raw!=='string'||!raw)throw workspaceError('Workspace snapshot is missing.',404,'CODE_AGENT_WORKSPACE_NOT_FOUND');
  let snapshot;try{snapshot=JSON.parse(raw);}catch{throw workspaceError('Workspace snapshot is unreadable.',500,'CODE_AGENT_WORKSPACE_CORRUPT');}
  if(snapshot?.version!==1||snapshot.ownerId!==ownerId||snapshot.jobId!==jobId)
    throw workspaceError('Workspace snapshot identity does not match this job.',403,'CODE_AGENT_WORKSPACE_SCOPE_MISMATCH');
  const normalized=normalizeFiles((snapshot.files||[]).map(file=>({path:file.path,content:file.encoding==='utf8'?file.content:file.encoding==='base64'?Buffer.from(String(file.content||''),'base64'):null,mode:file.mode})));
  const manifest=snapshot.files.map(file=>({path:file.path,encoding:file.encoding,mode:file.mode||'100644',sha256:file.sha256,size:file.size}));
  for(let i=0;i<normalized.files.length;i++){
    const actual=normalized.files[i],expected=snapshot.files[i];
    if(actual.path!==expected.path||actual.sha256!==expected.sha256||actual.size!==expected.size||actual.encoding!==expected.encoding||actual.mode!==(expected.mode||'100644'))
      throw workspaceError(`Workspace snapshot integrity check failed for ${String(expected.path||'file').slice(0,180)}.`,500,'CODE_AGENT_WORKSPACE_INTEGRITY_FAILED');
  }
  return {version:snapshot.version,createdAt:snapshot.createdAt,files:normalized.files.map(({path,encoding,content,mode,size,sha256})=>({path,encoding,content,mode,size,sha256})),manifest,deletedPaths:normalizeDeletedPaths(snapshot.deletedPaths||[])};
}
