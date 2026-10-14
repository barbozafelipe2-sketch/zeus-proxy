function envInt(name, fallback, min=1, max=10000) {
  const raw = globalThis.Netlify?.env?.get?.(name);
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

// Counts user executions, not billable model calls or dollars. Enforce spend caps with providers.
export const DEFAULT_AI_HOURLY_LIMITS=Object.freeze({ZEUS:15,OLYMPUS:3});
export function aiLimits(mode='ZEUS') {
  return mode === 'OLYMPUS'
    ? { hourly: envInt('OLYHUB_OLYMPUS_HOURLY_LIMIT', DEFAULT_AI_HOURLY_LIMITS.OLYMPUS, 1, 500), concurrent: envInt('OLYHUB_OLYMPUS_CONCURRENCY', 1, 1, 5) }
    : { hourly: envInt('OLYHUB_ZEUS_HOURLY_LIMIT', DEFAULT_AI_HOURLY_LIMITS.ZEUS, 1, 1000), concurrent: envInt('OLYHUB_ZEUS_CONCURRENCY', 2, 1, 10) };
}

export function endpointLimit(kind) {
  const defaults = { transcribe: 30, artifact: 60, upload: 120, maintenance: 12 };
  const envName = `OLYHUB_${String(kind).toUpperCase()}_HOURLY_LIMIT`;
  return envInt(envName, defaults[kind] || 60, 1, 2000);
}

function limitError(message, code, retryAfter=60) {
  const error = new Error(message);
  error.status = 429;
  error.code = code;
  error.retryAfter = retryAfter;
  return error;
}

// This lock must be held from the execution lookup through the attempt INSERT.
// Call inside a PostgreSQL transaction; the lock releases automatically at COMMIT/ROLLBACK.
export async function lockAiExecutionOwner(client,ownerId){
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[`olyhub-ai:${ownerId}`]);
}

// Admission only. Distinct paid-capable STARTS (not unique request IDs) count per hour.
// Call only for a new execution or an actual restart, never for a replay, an in-progress
// poll, or the first handoff of a previously billed QUEUED job to the Olympus worker.
export async function guardAiExecution(client,ownerId,mode,requestId,{excludeExecutionId=null}={}){
  const limits=aiLimits(mode);
  // Shared text-inference spending threshold for Zeus and Olympus. Counts both
  // modes, in UTC calendar months, using the best *known estimated* USD subtotal.
  // Audio/video/image provider bills must be controlled separately; missing
  // token pricing cannot be represented as zero-cost inference.
  const monthlyCap=envInt('ZEUS_TEXT_MONTHLY_USD',60,1,10000);
  const spending=(await client.query(
    `SELECT COALESCE(SUM(CASE WHEN (trace->'usage'->>'estimatedUsd') ~ '^[0-9]+([.][0-9]+)?(await client.query(
    `SELECT
       count(*) FILTER (WHERE mode='ZEUS' AND started_at > now() - interval '90 seconds')::int AS zeus,
       count(*) FILTER (WHERE mode='OLYMPUS' AND started_at > now() - interval '16 minutes')::int AS olympus
     FROM executions
     WHERE owner_id=$1
       AND ($2::uuid IS NULL OR id<>$2::uuid)
       AND state NOT IN ('COMPLETED','PARTIAL','FAILED','CANCELLED')`,
    [ownerId,excludeExecutionId]
  )).rows[0]||{zeus:0,olympus:0};
  if(mode==='OLYMPUS'&&Number(active.olympus||0)>=limits.concurrent)
    throw limitError('An Olympus execution is already running. Wait for it to finish before starting another.','AI_CONCURRENCY_LIMIT',15);
  if(mode!=='OLYMPUS'&&Number(active.zeus||0)>=limits.concurrent)
    throw limitError('Too many Zeus executions are already running. Wait a moment and try again.','AI_CONCURRENCY_LIMIT',10);
  const recent=(await client.query(
    `SELECT count(*)::int AS total FROM execution_attempts WHERE owner_id=$1 AND mode=$2 AND created_at>now()-interval '1 hour'`,
    [ownerId,mode]
  )).rows[0];
  if(Number(recent?.total||0)>=limits.hourly)
    throw limitError(`${mode==='OLYMPUS'?'Olympus':'Zeus'} hourly safety budget reached. Try again later.`,'AI_RATE_LIMIT',300);
  return {admitted:true};
}

// Atomic durable ledger. An execution ID can appear multiple times, one per charged
// start. This INSERT must remain in the SAME transaction and advisory-lock scope as
// guardAiExecution and the new/retry execution state transition.
export async function recordAiExecutionAttempt(client,ownerId,mode,executionId,kind='initial'){
  if(kind!=='initial'&&kind!=='retry')throw new Error('Invalid AI execution attempt kind.');
  await client.query(
    `INSERT INTO execution_attempts(owner_id,execution_id,mode,attempt_kind) VALUES($1,$2,$3,$4)`,
    [ownerId,executionId,mode,kind]
  );
}

export async function consumeEndpointRate(db, ownerId, kind, requestId, limit=endpointLimit(kind)) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`olyhub-rate:${ownerId}:${kind}`]);
    // This endpoint has no durable replay result. A repeated client requestId is
    // another invocation, never a free idempotent replay. Count each admitted operation.
    // The ledger's request_id column is a unique *server-side event ID*, not the
    // caller-supplied requestId, preventing unlimited reprocessing using one value.
    const count = Number((await client.query(`SELECT count(*)::int AS total FROM request_rate_events WHERE owner_id=$1 AND kind=$2 AND created_at > now() - interval '1 hour'`, [ownerId, kind])).rows[0]?.total || 0);
    if (count >= limit) throw limitError('Request safety limit reached. Try again later.', 'RATE_LIMIT', 300);
    const logged=await client.query(
      'INSERT INTO request_rate_events(owner_id,kind,request_id) VALUES($1,$2,gen_random_uuid()::text) RETURNING id',
      [ownerId,kind]
    );
    if(logged.rowCount!==1)throw new Error('Endpoint rate reservation was not recorded.');
    await client.query(`DELETE FROM request_rate_events WHERE created_at < now() - interval '48 hours'`);
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }
}

      THEN (trace->'usage'->>'estimatedUsd')::numeric ELSE 0 END),0)::float8 AS known_usd,
      count(*) FILTER (WHERE trace->'usage'->>'estimateCoverage' IN ('partial','none'))::int AS incomplete
     FROM executions WHERE owner_id=$1
       AND started_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
       AND started_at < (date_trunc('month',now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC'
       AND trace IS NOT NULL`,
    [ownerId]
  )).rows[0]||{known_usd:0,incomplete:0};
  if(Number(spending.known_usd||0)>=monthlyCap)
    throw limitError(`Zeus text budget reached: at least ${monthlyCap} in estimated usage this month. Further text requests are paused until you explicitly increase the server budget.`,'ZEUS_MONTHLY_TEXT_BUDGET',3600);
  const active=(await client.query(
    `SELECT
       count(*) FILTER (WHERE mode='ZEUS' AND started_at > now() - interval '90 seconds')::int AS zeus,
       count(*) FILTER (WHERE mode='OLYMPUS' AND started_at > now() - interval '16 minutes')::int AS olympus
     FROM executions
     WHERE owner_id=$1
       AND ($2::uuid IS NULL OR id<>$2::uuid)
       AND state NOT IN ('COMPLETED','PARTIAL','FAILED','CANCELLED')`,
    [ownerId,excludeExecutionId]
  )).rows[0]||{zeus:0,olympus:0};
  if(mode==='OLYMPUS'&&Number(active.olympus||0)>=limits.concurrent)
    throw limitError('An Olympus execution is already running. Wait for it to finish before starting another.','AI_CONCURRENCY_LIMIT',15);
  if(mode!=='OLYMPUS'&&Number(active.zeus||0)>=limits.concurrent)
    throw limitError('Too many Zeus executions are already running. Wait a moment and try again.','AI_CONCURRENCY_LIMIT',10);
  const recent=(await client.query(
    `SELECT count(*)::int AS total FROM execution_attempts WHERE owner_id=$1 AND mode=$2 AND created_at>now()-interval '1 hour'`,
    [ownerId,mode]
  )).rows[0];
  if(Number(recent?.total||0)>=limits.hourly)
    throw limitError(`${mode==='OLYMPUS'?'Olympus':'Zeus'} hourly safety budget reached. Try again later.`,'AI_RATE_LIMIT',300);
  return {admitted:true};
}

// Atomic durable ledger. An execution ID can appear multiple times, one per charged
// start. This INSERT must remain in the SAME transaction and advisory-lock scope as
// guardAiExecution and the new/retry execution state transition.
export async function recordAiExecutionAttempt(client,ownerId,mode,executionId,kind='initial'){
  if(kind!=='initial'&&kind!=='retry')throw new Error('Invalid AI execution attempt kind.');
  await client.query(
    `INSERT INTO execution_attempts(owner_id,execution_id,mode,attempt_kind) VALUES($1,$2,$3,$4)`,
    [ownerId,executionId,mode,kind]
  );
}

export async function consumeEndpointRate(db, ownerId, kind, requestId, limit=endpointLimit(kind)) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`olyhub-rate:${ownerId}:${kind}`]);
    // This endpoint has no durable replay result. A repeated client requestId is
    // another invocation, never a free idempotent replay. Count each admitted operation.
    // The ledger's request_id column is a unique *server-side event ID*, not the
    // caller-supplied requestId, preventing unlimited reprocessing using one value.
    const count = Number((await client.query(`SELECT count(*)::int AS total FROM request_rate_events WHERE owner_id=$1 AND kind=$2 AND created_at > now() - interval '1 hour'`, [ownerId, kind])).rows[0]?.total || 0);
    if (count >= limit) throw limitError('Request safety limit reached. Try again later.', 'RATE_LIMIT', 300);
    const logged=await client.query(
      'INSERT INTO request_rate_events(owner_id,kind,request_id) VALUES($1,$2,gen_random_uuid()::text) RETURNING id',
      [ownerId,kind]
    );
    if(logged.rowCount!==1)throw new Error('Endpoint rate reservation was not recorded.');
    await client.query(`DELETE FROM request_rate_events WHERE created_at < now() - interval '48 hours'`);
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }
}
