import { requireUser } from './_shared/auth.mjs';
import { assertGithubRepoAllowed, githubTokenConfigured } from './_shared/github-write.mjs';
import { approveCodeAgentJob, createCodeAgentJob, ensureCodeAgentRecoveryDispatch } from './_shared/code-agent-jobs.mjs';
import { errorJson, getRequestId, json, readJson } from './_shared/http.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function triggerBackground(req,ownerId,dispatchToken){
  if(!dispatchToken)return;
  const url=new URL('/api/code-agent-background',req.url);
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ownerId,dispatchToken}),signal:AbortSignal.timeout(4000)});
  if(!response.ok&&response.status!==202)throw Object.assign(new Error('Background worker could not be dispatched.'),{status:503,code:'CODE_AGENT_DISPATCH_FAILED'});
}
function publicJob(row){
  if(!row)return null;
  const {dispatch_token,worker_token,lease_expires_at,workspace_blob_key,workspace_manifest,base_workspace_blob_key,base_workspace_manifest,...safe}=row;
  return safe;
}

async function handler(req,context){
  const requestId=getRequestId(req,context,null),auth=await requireUser(req,requestId);
  if(auth.error)return auth.error;
  const {user,db}=auth,url=new URL(req.url);
  try{
    if(req.method==='GET'){
      const jobId=url.searchParams.get('id');
      if(jobId&&!UUID.test(jobId))return errorJson('Invalid coding job id.',400,'INVALID_CODE_AGENT_JOB',requestId);
      const rows=jobId
        ? await db.sql`SELECT * FROM code_agent_jobs WHERE id=${jobId}::uuid AND owner_id=${user.id}`
        : await db.sql`SELECT * FROM code_agent_jobs WHERE owner_id=${user.id} ORDER BY queue_sequence DESC LIMIT 40`;
      const events=jobId&&rows[0]
        ? await db.sql`SELECT id,job_id,event_type,phase,summary,metadata,created_at FROM code_agent_job_events WHERE job_id=${jobId}::uuid AND owner_id=${user.id} ORDER BY id ASC`
        : await db.sql`SELECT id,job_id,event_type,phase,summary,metadata,created_at FROM code_agent_job_events WHERE owner_id=${user.id} AND job_id IN (SELECT id FROM code_agent_jobs WHERE owner_id=${user.id} ORDER BY queue_sequence DESC LIMIT 40) ORDER BY id ASC`;
      const recovery=await ensureCodeAgentRecoveryDispatch(db,user.id);
      if(recovery?.dispatch_token)await triggerBackground(req,user.id,recovery.dispatch_token).catch(()=>{});
      return json({jobs:rows.map(publicJob),job:jobId?publicJob(rows[0]):undefined,events});
    }
    if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
    const body=await readJson(req);
    if(body?.action==='approve'){
      if(!UUID.test(String(body.jobId||'')))return errorJson('Invalid coding job id.',400,'INVALID_CODE_AGENT_JOB',requestId);
      const approved=await approveCodeAgentJob(db,{ownerId:user.id,jobId:body.jobId});
      if(!approved)return errorJson('This roadmap is no longer waiting for approval.',409,'CODE_AGENT_APPROVAL_CONFLICT',requestId);
      await triggerBackground(req,user.id,approved.dispatch_token);
      return json({job:publicJob(approved)},202);
    }
    if(!githubTokenConfigured())return errorJson('Add GITHUB_TOKEN to the Netlify Functions environment variables first.',503,'GITHUB_WRITE_NOT_CONFIGURED',requestId);
    const repoUrl=String(body?.repoUrl||'').trim();
    const repo=assertGithubRepoAllowed(repoUrl,{allowAnyRepo:true});
    const id=String(body?.requestId||requestId);
    if(!UUID.test(id))return errorJson('A valid request id is required.',400,'INVALID_CODE_AGENT_JOB',requestId);
    const created=await createCodeAgentJob(db,{ownerId:user.id,projectId:body?.projectId||null,conversationId:body?.conversationId||null,
      requestId:id,repoOwner:repo.owner,repoName:repo.repo,targetBranch:String(body?.branch||'main'),requestText:String(body?.requestText||'')});
    await triggerBackground(req,user.id,created.job.dispatch_token);
    return json({job:publicJob(created.job),replayed:created.replayed},202);
  }catch(error){
    return errorJson(error?.message||'The coding queue could not complete this request.',error?.status||500,error?.code||'CODE_AGENT_REQUEST_FAILED',requestId);
  }
}
export default handler;
export const config={path:'/api/code-agent'};
