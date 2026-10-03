function envInt(name, fallback, min=1, max=10000) {
  const raw = globalThis.Netlify?.env?.get?.(name);
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export function aiLimits(mode='ZEUS') {
  return mode === 'OLYMPUS'
    ? { hourly: envInt('OLYHUB_OLYMPUS_HOURLY_LIMIT', 20, 1, 500), concurrent: envInt('OLYHUB_OLYMPUS_CONCURRENCY', 1, 1, 5) }
    : { hourly: envInt('OLYHUB_ZEUS_HOURLY_LIMIT', 60, 1, 1000), concurrent: envInt('OLYHUB_ZEUS_CONCURRENCY', 2, 1, 10) };
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

export async function guardAiExecution(client, ownerId, mode, requestId) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`olyhub-ai:${ownerId}`]);
  const existing = (await client.query(`SELECT id,state FROM executions WHERE owner_id=$1 AND request_id=$2 LIMIT 1`, [ownerId, requestId])).rows[0];
  if (existing) return { existing };

  const limits = aiLimits(mode);
  const active = (await client.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE mode='OLYMPUS')::int AS olympus
     FROM executions
     WHERE owner_id=$1
       AND state NOT IN ('COMPLETED','PARTIAL','FAILED','CANCELLED')
       AND started_at > now() - interval '15 minutes'`,
    [ownerId]
  )).rows[0] || { total:0, olympus:0 };
  if (mode === 'OLYMPUS' && Number(active.olympus || 0) >= limits.concurrent) throw limitError('An Olympus execution is already running. Wait for it to finish before starting another.', 'AI_CONCURRENCY_LIMIT', 15);
  if (mode !== 'OLYMPUS' && Number(active.total || 0) >= limits.concurrent) throw limitError('Too many AI executions are already running. Wait a moment and try again.', 'AI_CONCURRENCY_LIMIT', 10);

  const recent = (await client.query(`SELECT count(*)::int AS total FROM executions WHERE owner_id=$1 AND mode=$2 AND started_at > now() - interval '1 hour'`, [ownerId, mode])).rows[0];
  if (Number(recent?.total || 0) >= limits.hourly) throw limitError(`${mode === 'OLYMPUS' ? 'Olympus' : 'Zeus'} hourly safety budget reached. Try again later.`, 'AI_RATE_LIMIT', 300);
  return { existing:null };
}

export async function consumeEndpointRate(db, ownerId, kind, requestId, limit=endpointLimit(kind)) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`olyhub-rate:${ownerId}:${kind}`]);
    const exists = (await client.query(`SELECT 1 FROM request_rate_events WHERE owner_id=$1 AND kind=$2 AND request_id=$3 LIMIT 1`, [ownerId, kind, requestId])).rowCount > 0;
    if (exists) { await client.query('COMMIT'); return; }
    const count = Number((await client.query(`SELECT count(*)::int AS total FROM request_rate_events WHERE owner_id=$1 AND kind=$2 AND created_at > now() - interval '1 hour'`, [ownerId, kind])).rows[0]?.total || 0);
    if (count >= limit) throw limitError('Request safety limit reached. Try again later.', 'RATE_LIMIT', 300);
    await client.query(`INSERT INTO request_rate_events(owner_id,kind,request_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [ownerId, kind, requestId]);
    await client.query(`DELETE FROM request_rate_events WHERE created_at < now() - interval '48 hours'`);
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }
}
