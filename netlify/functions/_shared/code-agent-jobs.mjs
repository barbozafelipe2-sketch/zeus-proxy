import { withTransaction } from './db.mjs';

export const CODE_AGENT_LEASE_MS=240_000;
const OWNER_LOCK_PREFIX='olyhub-code-agent:';
const REPO_PART=/^[A-Za-z0-9_.-]{1,100}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_ID=/^[A-Za-z0-9_.:-]{1,160}$/;
const BRANCH=/^[A-Za-z0-9][A-Za-z0-9_.\/-]{0,119}$/;
const TERMINAL=new Set(['COMPLETED','FAILED','CANCELLED']);
const TRANSITIONS=Object.freeze({
  QUEUED:new Set(['PLANNING','CANCELLED']),
  PLANNING:new Set(['AWAITING_APPROVAL','RUNNING','FAILED','CANCELLED']),
  AWAITING_APPROVAL:new Set(['QUEUED','CANCELLED']),
  RUNNING:new Set(['RUNNING','COMMITTING','COMPLETED','FAILED','CANCELLED']),
  COMMITTING:new Set(['COMPLETED','FAILED']),
});

function jobError(message,status=400,code='INVALID_CODE_AGENT_JOB'){
  return Object.assign(new Error(message),{status,code});
}
function normalizeRepoPart(value,label){
  const result=String(value||'').trim();
  if(!REPO_PART.test(result)||result==='.'||result==='..')throw jobError(`Invalid GitHub ${label}.`);
  return result;
}
function normalizeBranch(value){
  const result=String(value||'main').trim();
  if(!BRANCH.test(result)||result.includes('..')||result.includes('//')||result.endsWith('/')||result.endsWith('.lock')||result.includes('@{'))
    throw jobError('Invalid target branch.');
  return result;
}
function normalizeRequest(value){
  const result=typeof value==='string'?value.trim().slice(0,40_000):'';
  if(!result)throw jobError('A coding request is required.');
  return result;
}
function normalizeEvent(event={}){
  const summary=String(event.summary||'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,' ').trim().slice(0,1200);
  if(!summary)throw jobError('A job event summary is required.');
  const metadata=event.metadata&&typeof event.metadata==='object'&&!Array.isArray(event.metadata)?event.metadata:{};
  return {type:String(event.type||'PROGRESS'),phase:Number.isInteger(event.phase)&&event.phase>=0?event.phase:null,summary,metadata};
}
async function ownerLock(client,ownerId){
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${OWNER_LOCK_PREFIX}${ownerId}`]);
}
async function insertEvent(client,ownerId,jobId,event){
  const item=normalizeEvent(event);
  await client.query(
    `INSERT INTO code_agent_job_events(job_id,owner_id,event_type,phase,summary,metadata)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [jobId,ownerId,item.type,item.phase,item.summary,JSON.stringify(item.metadata)]
  );
}

// Each submitted request is a FIFO job. requestId makes browser retries
// idempotent, while the per-owner advisory lock defines queue insertion order.
export async function createCodeAgentJob(db,{ownerId,projectId=null,conversationId=null,requestId,repoOwner,repoName,targetBranch='main',requestText}){
  if(!OWNER_ID.test(String(ownerId||'')))throw jobError('A valid workspace owner is required.');
  if(!UUID.test(String(requestId||'')))throw jobError('A valid idempotency request id is required.');
  const values={repoOwner:normalizeRepoPart(repoOwner,'owner'),repoName:normalizeRepoPart(repoName,'repository'),targetBranch:normalizeBranch(targetBranch),requestText:normalizeRequest(requestText)};
  if(projectId&&!UUID.test(String(projectId)))throw jobError('Invalid project id.');
  if(conversationId&&!UUID.test(String(conversationId)))throw jobError('Invalid conversation id.');
  return withTransaction(db,async client=>{
    await ownerLock(client,ownerId);
    const dispatchToken=globalThis.crypto.randomUUID();
    if(projectId){
      const project=(await client.query('SELECT id FROM projects WHERE id=$1 AND owner_id=$2 FOR SHARE',[projectId,ownerId])).rows[0];
      if(!project)throw jobError('Project not found.',404,'PROJECT_NOT_FOUND');
    }
    if(conversationId){
      const conversation=(await client.query('SELECT id,project_id FROM conversations WHERE id=$1 AND owner_id=$2 FOR SHARE',[conversationId,ownerId])).rows[0];
      if(!conversation)throw jobError('Conversation not found.',404,'CONVERSATION_NOT_FOUND');
      if((conversation.project_id||null)!==(projectId||null))throw jobError('Conversation does not belong to this project scope.',409,'CODE_AGENT_SCOPE_MISMATCH');
    }
    const inserted=(await client.query(
      `INSERT INTO code_agent_jobs(owner_id,project_id,conversation_id,request_id,repo_owner,repo_name,target_branch,request_text,status,dispatch_token)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'QUEUED',$9::uuid)
       ON CONFLICT(owner_id,request_id) DO NOTHING
       RETURNING *`,
      [ownerId,projectId,conversationId,requestId,values.repoOwner,values.repoName,values.targetBranch,values.requestText,dispatchToken]
    )).rows[0];
    if(!inserted){
      const existing=(await client.query('SELECT * FROM code_agent_jobs WHERE owner_id=$1 AND request_id=$2',[ownerId,requestId])).rows[0];
      if(!existing)throw jobError('The queued request could not be recovered.',409,'CODE_AGENT_IDEMPOTENCY_CONFLICT');
      return {job:existing,replayed:true};
    }
    await insertEvent(client,ownerId,inserted.id,{type:'QUEUED',summary:'Request added to the coding queue.',metadata:{queueSequence:String(inserted.queue_sequence)}});
    return {job:inserted,replayed:false};
  });
}

// Claims exactly one FIFO job per owner. A fencing token prevents an expired
// or retried Netlify background invocation from saving over a newer worker.
export async function claimNextCodeAgentJob(db,ownerId,{dispatchToken,leaseMs=CODE_AGENT_LEASE_MS}={}){
  if(!OWNER_ID.test(String(ownerId||'')))throw jobError('A valid workspace owner is required.');
  if(!UUID.test(String(dispatchToken||'')))return null;
  const duration=Math.max(30_000,Math.min(900_000,Number(leaseMs)||CODE_AGENT_LEASE_MS));
  return withTransaction(db,async client=>{
    await ownerLock(client,ownerId);
    const dispatch=(await client.query(
      `SELECT id FROM code_agent_jobs WHERE owner_id=$1 AND dispatch_token=$2::uuid AND status='QUEUED' FOR UPDATE`,
      [ownerId,dispatchToken]
    )).rows[0];
    if(!dispatch)return null;
    await client.query(
      `UPDATE code_agent_jobs SET status='QUEUED',worker_token=NULL,dispatch_token=gen_random_uuid(),lease_expires_at=NULL,updated_at=now()
       WHERE owner_id=$1 AND status IN ('PLANNING','RUNNING') AND lease_expires_at<=now()`,[ownerId]
    );
    await client.query(
      `UPDATE code_agent_jobs SET status='QUEUED',worker_token=NULL,dispatch_token=gen_random_uuid(),lease_expires_at=NULL,commit_recovery=true,updated_at=now()
       WHERE owner_id=$1 AND status='COMMITTING' AND lease_expires_at<=now()`,[ownerId]
    );
    const active=(await client.query(
      `SELECT id,status FROM code_agent_jobs WHERE owner_id=$1 AND status IN ('PLANNING','RUNNING','COMMITTING')
       AND lease_expires_at>now() LIMIT 1 FOR UPDATE`,[ownerId]
    )).rows[0];
    if(active)return null;
    const candidate=(await client.query(
      `SELECT * FROM code_agent_jobs WHERE owner_id=$1 AND status='QUEUED'
       ORDER BY queue_sequence ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,[ownerId]
    )).rows[0];
    if(!candidate)return null;
    const workerToken=globalThis.crypto.randomUUID();
    const claimed=(await client.query(
      `UPDATE code_agent_jobs SET status='PLANNING',worker_token=$1::uuid,dispatch_token=NULL,
         lease_expires_at=now()+($2::int * interval '1 millisecond'),
         attempt_count=attempt_count+1,started_at=COALESCE(started_at,now()),updated_at=now()
       WHERE id=$3 AND owner_id=$4 AND status='QUEUED' RETURNING *`,
      [workerToken,duration,candidate.id,ownerId]
    )).rows[0];
    if(!claimed)return null;
    await insertEvent(client,ownerId,claimed.id,{type:claimed.commit_recovery?'COMMIT_STARTED':'PHASE_STARTED',phase:claimed.current_phase,
      summary:claimed.commit_recovery?'Reconciling an interrupted GitHub commit.':claimed.approved_at?`Starting approved phase ${Number(claimed.current_phase)+1}.`:'Building the implementation roadmap.'});
    return claimed;
  });
}

export async function renewCodeAgentJobLease(db,{ownerId,jobId,workerToken,leaseMs=CODE_AGENT_LEASE_MS}){
  if(!OWNER_ID.test(String(ownerId||''))||!UUID.test(String(jobId||''))||!UUID.test(String(workerToken||'')))return false;
  const duration=Math.max(30_000,Math.min(900_000,Number(leaseMs)||CODE_AGENT_LEASE_MS));
  const rows=await db.sql`
    UPDATE code_agent_jobs SET lease_expires_at=now()+(${duration}::int * interval '1 millisecond'),updated_at=now()
    WHERE id=${jobId} AND owner_id=${ownerId} AND worker_token=${workerToken}::uuid
      AND lease_expires_at>now() AND status IN ('PLANNING','RUNNING','COMMITTING') RETURNING id`;
  return rows.length===1;
}

// Checkpoints persist the plan and Blobs snapshot reference before emitting
// progress. The worker lease is checked in the same transaction as both writes.
export async function checkpointCodeAgentJob(db,{ownerId,jobId,workerToken,status,phase,plan,workspaceBlobKey,workspaceManifest,event}){
  if(!['PLANNING','AWAITING_APPROVAL','RUNNING','COMMITTING'].includes(status))
    throw jobError('Invalid coding job checkpoint state.');
  if(!Number.isInteger(Number(phase))||Number(phase)<0)throw jobError('Invalid coding job phase.');
  if(workspaceManifest!==undefined&&!Array.isArray(workspaceManifest))throw jobError('Workspace manifest must be an array.');
  return withTransaction(db,async client=>{
    const current=(await client.query(
      `SELECT status FROM code_agent_jobs WHERE id=$1 AND owner_id=$2 AND worker_token=$3::uuid
       AND lease_expires_at>now() FOR UPDATE`,[jobId,ownerId,workerToken]
    )).rows[0];
    if(!current)throw jobError('Coding job ownership expired or was superseded.',409,'CODE_AGENT_LEASE_CONFLICT');
    if(current.status!==status&&!TRANSITIONS[current.status]?.has(status))throw jobError('Invalid coding job state transition.',409,'CODE_AGENT_STATE_CONFLICT');
    const updated=(await client.query(
      `UPDATE code_agent_jobs SET status=$1,current_phase=$2,
         plan=COALESCE($3::jsonb,plan),workspace_blob_key=COALESCE($4,workspace_blob_key),
         workspace_manifest=COALESCE($5::jsonb,workspace_manifest),
         worker_token=CASE WHEN $1='AWAITING_APPROVAL' THEN NULL ELSE worker_token END,
         dispatch_token=CASE WHEN $1='AWAITING_APPROVAL' THEN NULL ELSE dispatch_token END,
         lease_expires_at=CASE WHEN $1='AWAITING_APPROVAL' THEN NULL ELSE lease_expires_at END,
         updated_at=now()
       WHERE id=$6 AND owner_id=$7 RETURNING *`,
      [status,Number(phase),plan===undefined?null:JSON.stringify(plan),workspaceBlobKey===undefined?null:workspaceBlobKey,
        workspaceManifest===undefined?null:JSON.stringify(workspaceManifest),jobId,ownerId]
    )).rows[0];
    if(event)await insertEvent(client,ownerId,jobId,event);
    return updated;
  });
}

export async function approveCodeAgentJob(db,{ownerId,jobId}){
  return withTransaction(db,async client=>{
    await ownerLock(client,ownerId);
    const dispatchToken=globalThis.crypto.randomUUID();
    const row=(await client.query(
      `UPDATE code_agent_jobs SET status='QUEUED',dispatch_token=$3::uuid,approved_at=now(),requires_approval=false,commit_recovery=false,updated_at=now()
       WHERE id=$1 AND owner_id=$2 AND status='AWAITING_APPROVAL' RETURNING *`,[jobId,ownerId,dispatchToken]
    )).rows[0];
    if(!row)return null;
    await insertEvent(client,ownerId,jobId,{type:'APPROVED',phase:row.current_phase,summary:'Felipe approved the roadmap and execution.'});
    return row;
  });
}

export async function ensureCodeAgentRecoveryDispatch(db,ownerId){
  if(!OWNER_ID.test(String(ownerId||'')))return null;
  return withTransaction(db,async client=>{
    await ownerLock(client,ownerId);
    await client.query(
      `UPDATE code_agent_jobs SET status='QUEUED',worker_token=NULL,dispatch_token=gen_random_uuid(),lease_expires_at=NULL,updated_at=now()
       WHERE owner_id=$1 AND status IN ('PLANNING','RUNNING') AND lease_expires_at<=now()`,[ownerId]
    );
    await client.query(
      `UPDATE code_agent_jobs SET status='QUEUED',worker_token=NULL,dispatch_token=gen_random_uuid(),lease_expires_at=NULL,commit_recovery=true,updated_at=now()
       WHERE owner_id=$1 AND status='COMMITTING' AND lease_expires_at<=now()`,[ownerId]
    );
    return (await client.query(`SELECT id,dispatch_token FROM code_agent_jobs WHERE owner_id=$1 AND status='QUEUED' AND dispatch_token IS NOT NULL ORDER BY queue_sequence ASC LIMIT 1`,[ownerId])).rows[0]||null;
  });
}

export async function nextCodeAgentDispatch(db,ownerId){
  const rows=await db.sql`
    SELECT id,dispatch_token FROM code_agent_jobs WHERE owner_id=${ownerId} AND status='QUEUED'
      AND dispatch_token IS NOT NULL ORDER BY queue_sequence ASC LIMIT 1`;
  return rows[0]||null;
}

export async function completeCodeAgentJob(db,{ownerId,jobId,workerToken,status,resultSummary=null,errorCode=null,commitSha=null}){
  if(!TERMINAL.has(status))throw jobError('Invalid terminal coding job state.');
  return withTransaction(db,async client=>{
    const current=(await client.query(
      `SELECT status FROM code_agent_jobs WHERE id=$1 AND owner_id=$2 AND worker_token=$3::uuid
       AND lease_expires_at>now() FOR UPDATE`,[jobId,ownerId,workerToken]
    )).rows[0];
    if(!current)return null;
    if(!TRANSITIONS[current.status]?.has(status))throw jobError('Invalid terminal coding job transition.',409,'CODE_AGENT_STATE_CONFLICT');
    const row=(await client.query(
      `UPDATE code_agent_jobs SET status=$1,result_summary=$2,error_code=$3,commit_sha=$4,commit_recovery=false,
         completed_at=now(),updated_at=now(),worker_token=NULL,dispatch_token=NULL,lease_expires_at=NULL
       WHERE id=$5 AND owner_id=$6 AND worker_token=$7::uuid AND lease_expires_at>now()
         AND status IN ('PLANNING','RUNNING','COMMITTING') RETURNING *`,
      [status,String(resultSummary||'').slice(0,4000)||null,/^[A-Z][A-Z0-9_]{1,63}$/.test(String(errorCode||''))?errorCode:null,
        typeof commitSha==='string'?commitSha.slice(0,80):null,jobId,ownerId,workerToken]
    )).rows[0];
    if(!row)return null;
    await insertEvent(client,ownerId,jobId,{type:status==='COMPLETED'?'COMMIT_COMPLETED':status,phase:row.current_phase,
      summary:status==='COMPLETED'?'Coding job completed.':status==='FAILED'?'Coding job failed.':'Coding job was cancelled.',
      metadata:{commitSha:row.commit_sha,errorCode:row.error_code}});
    return row;
  });
}
