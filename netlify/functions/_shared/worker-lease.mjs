// Durable, owner-scoped Olympus queue/worker leases.
// Every dispatch has a nonce; every claimed worker has an independent fencing token.
// All acquisition writes happen while holding the same transaction lock as initializeTurn.
export const OLYMPUS_QUEUE_LEASE_MS=240_000;
export const OLYMPUS_WORKER_LEASE_MS=210_000;
export const OLYMPUS_LEGACY_STALE_MS=960_000; // 16 minutes for unleased legacy background runs.
export const ZEUS_SYNC_STALE_MS=90_000;

function validDate(value){
  const n=Date.parse(String(value||''));
  return Number.isFinite(n)?n:null;
}
export function executionLeaseExpired(execution,now=Date.now()){
  if(!execution)return false;
  if(execution.mode!=='OLYMPUS'){
    const started=validDate(execution.started_at);
    return started!=null&&now-started>ZEUS_SYNC_STALE_MS;
  }
  const until=validDate(execution.lease_expires_at);
  if(until!=null)return now>=until;
  // Old records written before the additive lease migration must never be
  // reclaimed at the 90s synchronous threshold while their worker is alive.
  const started=validDate(execution.started_at);
  return started!=null&&now-started>OLYMPUS_LEGACY_STALE_MS;
}
export function validDispatchToken(value){
  return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
// The browser reserves/queues one generation; worker receives only this nonce.
// On retry a new generation supersedes all late HTTP deliveries from the old one.
export async function queueOlympusExecution(db,{executionId,ownerId}){
  const rows=await db.sql`UPDATE executions
    SET state='QUEUED',dispatch_token=gen_random_uuid(),worker_token=NULL,
        lease_expires_at=now()+interval '240 seconds',started_at=now()
    WHERE id=${executionId} AND owner_id=${ownerId}
      AND state='UNDERSTANDING' AND worker_token IS NULL
    RETURNING dispatch_token`;
  if(rows.length!==1)throw Object.assign(new Error('Olympus queue ownership changed.'),{status:409,code:'WORKER_LEASE_CONFLICT'});
  return String(rows[0].dispatch_token);
}
export async function claimOlympusWorker(client,{executionId,ownerId,dispatchToken}){
  if(!validDispatchToken(dispatchToken))return null;
  const result=await client.query(`UPDATE executions
    SET state='UNDERSTANDING',worker_token=gen_random_uuid(),
        lease_expires_at=now()+interval '210 seconds',started_at=now()
    WHERE id=$1 AND owner_id=$2 AND mode='OLYMPUS'
      AND state='QUEUED' AND dispatch_token=$3::uuid
      AND worker_token IS NULL AND lease_expires_at>now()
    RETURNING id,worker_token,lease_expires_at`,[executionId,ownerId,dispatchToken]);
  return result.rows[0]||null;
}
// If dispatch acknowledgement was lost, claim inline work only if the worker
// has NOT acquired the queue. A late worker cannot pass its QUEUED-only claim.
export async function claimInlineFallback(db,{executionId,ownerId,dispatchToken}){
  if(!validDispatchToken(dispatchToken))return null;
  const rows=await db.sql`UPDATE executions
    SET state='UNDERSTANDING',dispatch_token=NULL,
        worker_token=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds',
        started_at=now()
    WHERE id=${executionId} AND owner_id=${ownerId}
      AND mode='OLYMPUS' AND state='QUEUED'
      AND dispatch_token=${dispatchToken}::uuid AND worker_token IS NULL
      AND lease_expires_at>now()
    RETURNING worker_token,lease_expires_at`;
  return rows[0]||null;
}
// Hold a row lock until all artifact/message/COMPLETED writes commit, so a
// subsequent takeover cannot interleave a stale worker's final result.
export async function assertWorkerFence(client,{executionId,ownerId,workerToken}){
  if(!validDispatchToken(workerToken))throw Object.assign(new Error('Missing worker ownership token.'),{status:409,code:'WORKER_LEASE_CONFLICT'});
  const res=await client.query(`SELECT id FROM executions WHERE id=$1 AND owner_id=$2
    AND worker_token=$3::uuid AND lease_expires_at>now()
    AND state NOT IN ('COMPLETED','PARTIAL','FAILED','CANCELLED')
    FOR UPDATE`,[executionId,ownerId,workerToken]);
  if(!res.rowCount)throw Object.assign(new Error('Worker ownership expired or was superseded.'),{status:409,code:'WORKER_LEASE_CONFLICT'});
}
// A stale worker must not mark a newer run failed nor mark its user message failed.
// Non-token owners are only permitted to finish a pre-claim initial submission.
// One SQL statement atomically updates the owned execution AND its original
// user message. Reinitialization uses SELECT FOR UPDATE on the same execution,
// preventing a late error writer from re-marking a new attempt as failed.
export async function markFailureIfOwner(db,{executionId,ownerId,workerToken,errorCode,trace,userMessageId=null}){
  const failureMarker=JSON.stringify({failed:true,errorCode:/^[A-Z][A-Z0-9_]{1,63}$/.test(String(errorCode||''))?errorCode:'EXECUTION_FAILED'});
  if(workerToken){
    if(!validDispatchToken(workerToken))return false;
    const rows=await db.sql`
      WITH owned AS (
        UPDATE executions SET state='FAILED',error_code=${errorCode},trace=${trace},
          completed_at=now(),lease_expires_at=NULL,worker_token=NULL,dispatch_token=NULL
        WHERE id=${executionId} AND owner_id=${ownerId} AND worker_token=${workerToken}::uuid
          AND lease_expires_at>now()
          AND state NOT IN ('COMPLETED','PARTIAL','FAILED','CANCELLED')
        RETURNING id
      ), marked AS (
        UPDATE messages SET metadata=COALESCE(metadata,'{}'::jsonb)||${failureMarker}::jsonb
        WHERE id=${userMessageId}::uuid AND owner_id=${ownerId}
          AND execution_id IN (SELECT id FROM owned) RETURNING id
      ) SELECT id FROM owned`;
    return rows.length===1;
  }
  const rows=await db.sql`
    WITH owned AS (
      UPDATE executions SET state='FAILED',error_code=${errorCode},trace=${trace},completed_at=now()
      WHERE id=${executionId} AND owner_id=${ownerId} AND worker_token IS NULL
        AND state NOT IN ('COMPLETED','PARTIAL','FAILED','CANCELLED')
      RETURNING id
    ), marked AS (
      UPDATE messages SET metadata=COALESCE(metadata,'{}'::jsonb)||${failureMarker}::jsonb
      WHERE id=${userMessageId}::uuid AND owner_id=${ownerId}
        AND execution_id IN (SELECT id FROM owned) RETURNING id
    ) SELECT id FROM owned`;
  return rows.length===1;
}
