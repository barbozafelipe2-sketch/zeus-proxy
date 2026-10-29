import { getDatabase } from '@netlify/database';
import { json } from './_shared/http.mjs';
import { loadCodeAgentWorkspaceSnapshot } from './_shared/code-agent-workspace.mjs';
import { createSandboxSnapshotZip, verifySandboxIdentity } from './_shared/github-sandbox.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const config={path:'/api/code-agent-sandbox-snapshot',method:'POST'};

export default async function handler(req){
  try{
    const authorization=String(req.headers.get('authorization')||'');
    if(!authorization.startsWith('Bearer '))return json({error:'GitHub Actions identity is required.'},401,{'Cache-Control':'no-store'});
    const claims=await verifySandboxIdentity(authorization.slice(7));
    const body=await req.json().catch(()=>null),jobId=String(body?.jobId||'');
    if(!UUID.test(jobId))return json({error:'Invalid coding job id.'},400,{'Cache-Control':'no-store'});
    const db=getDatabase();
    const row=(await db.sql`SELECT id,owner_id,status,lease_expires_at,workspace_blob_key FROM code_agent_jobs WHERE id=${jobId}::uuid`)[0];
    if(!row||row.status!=='RUNNING'||!row.workspace_blob_key||new Date(row.lease_expires_at).getTime()<=Date.now())
      return json({error:'The coding workspace is not active for sandbox verification.'},409,{'Cache-Control':'no-store'});
    const snapshot=await loadCodeAgentWorkspaceSnapshot({ownerId:row.owner_id,jobId:row.id,blobKey:row.workspace_blob_key});
    const archive=await createSandboxSnapshotZip(snapshot);
    return new Response(archive,{status:200,headers:{'Content-Type':'application/zip','Content-Length':String(archive.byteLength),'Content-Disposition':`attachment; filename="olyhub-${row.id}.zip"`,'Cache-Control':'no-store','X-OlyHub-Sandbox-Run':String(claims.run_id)}});
  }catch(error){
    console.error('Code agent sandbox snapshot denied',error?.code||'unknown');
    return json({error:error?.message||'The workspace could not be prepared for verification.',code:error?.code||'CODE_AGENT_SANDBOX_FAILED'},error?.status||500,{'Cache-Control':'no-store'});
  }
}
