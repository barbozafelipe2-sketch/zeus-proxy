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
      const conversationId=url.searchParams.get('conversationId');
      if(conversationId&&!UUID.test(conversationId))return errorJson('Invalid conversation id.',400,'INVALID_CONVERSATION',requestId);
      const rows=jobId
        ? await db.sql`SELECT * FROM code_agent_jobs WHERE id=${jobId}::uuid AND owner_id=${user.id}`
        : conversationId
        ? await db.sql`SELECT * FROM code_agent_jobs WHERE owner_id=${user.id} AND conversation_id=${conversationId}::uuid ORDER BY queue_sequence DESC LIMIT 40`
        : await db.sql`SELECT * FROM code_agent_jobs WHERE owner_id=${user.id} ORDER BY queue_sequence DESC LIMIT 40`;
      const events=jobId&&rows[0]
        ? await db.sql`SELECT id,job_id,event_type,phase,summary,metadata,created_at FROM code_agent_job_events WHERE job_id=${jobId}::uuid AND owner_id=${user.id} ORDER BY id ASC`
        : conversationId
        ? await db.sql`SELECT id,job_id,event_type,phase,summary,metadata,created_at FROM code_agent_job_events WHERE owner_id=${user.id} AND job_id IN (SELECT id FROM code_agent_jobs WHERE owner_id=${user.id} AND conversation_id=${conversationId}::uuid ORDER BY queue_sequence DESC LIMIT 40) ORDER BY id ASC`
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
      const confirmationText=String(body.confirmationText||'').trim().slice(0,4000);
      let confirmationMessage=null;
      if(confirmationText&&approved.conversation_id){
        confirmationMessage=(await db.sql`INSERT INTO messages(owner_id,conversation_id,role,mode,content,metadata)
          VALUES(${user.id},${approved.conversation_id}::uuid,'user','ZEUS',${confirmationText},${JSON.stringify({source:'code_agent',codeAgentJobId:approved.id,approval:true})}::jsonb)
          RETURNING id,execution_id,role,mode,content,metadata,created_at`)[0];
        await db.sql`UPDATE conversations SET updated_at=now() WHERE id=${approved.conversation_id}::uuid AND owner_id=${user.id}`;
      }
      const dispatched=await triggerBackground(req,user.id,approved.dispatch_token).then(()=>true).catch(()=>false);
      return json({job:publicJob(approved),confirmationMessage,dispatchPending:!dispatched},202);
    }
    if(!githubTokenConfigured())return errorJson('Add GITHUB_TOKEN to the Netlify Functions environment variables first.',503,'GITHUB_WRITE_NOT_CONFIGURED',requestId);
    const repoUrl=String(body?.repoUrl||'').trim();
    const repo=assertGithubRepoAllowed(repoUrl,{allowAnyRepo:true});
    const id=String(body?.requestId||requestId);
    if(!UUID.test(id))return errorJson('A valid request id is required.',400,'INVALID_CODE_AGENT_JOB',requestId);
    const requestText=String(body?.requestText||'').trim().slice(0,40000);
    if(!requestText)return errorJson('A coding request is required.',400,'INVALID_CODE_AGENT_JOB',requestId);
    const displayText=String(body?.displayText||requestText).trim().slice(0,40000)||requestText;
    const projectId=body?.projectId||null,requestedConversation=body?.conversationId||null;
    if(projectId&&!UUID.test(String(projectId)))return errorJson('Invalid project id.',400,'INVALID_PROJECT_ID',requestId);
    if(requestedConversation&&!UUID.test(String(requestedConversation)))return errorJson('Invalid conversation id.',400,'INVALID_CONVERSATION',requestId);
    let conversationId=requestedConversation;
    if(conversationId){
      const conversation=(await db.sql`SELECT id,project_id FROM conversations WHERE id=${conversationId}::uuid AND owner_id=${user.id}`)[0];
      if(!conversation)return errorJson('Conversation not found.',404,'CONVERSATION_NOT_FOUND',requestId);
      if((conversation.project_id||null)!==(projectId||null))return errorJson('Conversation does not belong to this workspace.',409,'CODE_AGENT_SCOPE_MISMATCH',requestId);
    }else if(projectId){
      const project=(await db.sql`SELECT id,name FROM projects WHERE id=${projectId}::uuid AND owner_id=${user.id}`)[0];
      if(!project)return errorJson('Project not found.',404,'PROJECT_NOT_FOUND',requestId);
      const existing=(await db.sql`SELECT id FROM conversations WHERE owner_id=${user.id} AND project_id=${projectId}::uuid LIMIT 1`)[0];
      conversationId=existing?.id||null;
      if(!conversationId)conversationId=(await db.sql`INSERT INTO conversations(owner_id,project_id,title) VALUES(${user.id},${projectId}::uuid,${project.name}) RETURNING id`)[0].id;
    }else{
      const title=requestText.replace(/\s+/g,' ').slice(0,72)||'Coding workspace';
      conversationId=(await db.sql`INSERT INTO conversations(owner_id,project_id,title) VALUES(${user.id},NULL,${title}) RETURNING id`)[0].id;
    }
    const created=await createCodeAgentJob(db,{ownerId:user.id,projectId,conversationId,
      requestId:id,repoOwner:repo.owner,repoName:repo.repo,targetBranch:String(body?.branch||'main'),requestText});
    conversationId=created.job.conversation_id||conversationId;
    let userMessage=null,assistantMessage=null;
    if(!created.replayed){
      userMessage=(await db.sql`INSERT INTO messages(owner_id,conversation_id,role,mode,content,metadata)
        VALUES(${user.id},${conversationId}::uuid,'user','ZEUS',${displayText},${JSON.stringify({requestId:id,source:'code_agent',codeAgentJobId:created.job.id})}::jsonb)
        RETURNING id,execution_id,role,mode,content,metadata,created_at`)[0];
      assistantMessage=(await db.sql`INSERT INTO messages(owner_id,conversation_id,role,mode,content,metadata)
        VALUES(${user.id},${conversationId}::uuid,'assistant','ZEUS','Pedido recebido. Estou preparando o roadmap em segundo plano.',${JSON.stringify({codeAgentJobId:created.job.id,source:'code_agent'})}::jsonb)
        RETURNING id,execution_id,role,mode,content,metadata,created_at`)[0];
      await db.sql`UPDATE conversations SET updated_at=now() WHERE id=${conversationId}::uuid AND owner_id=${user.id}`;
    }
    const dispatched=await triggerBackground(req,user.id,created.job.dispatch_token).then(()=>true).catch(()=>false);
    return json({job:publicJob(created.job),conversationId,userMessage,assistantMessage,replayed:created.replayed,dispatchPending:!dispatched},202);
  }catch(error){
    return errorJson(error?.message||'The coding queue could not complete this request.',error?.status||500,error?.code||'CODE_AGENT_REQUEST_FAILED',requestId);
  }
}
export default handler;
export const config={path:'/api/code-agent'};
