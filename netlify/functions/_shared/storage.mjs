import { blobStore } from './blob.mjs';

export async function queueProjectBlobs(client, ownerId, projectId) {
  const files = (await client.query(`SELECT blob_key FROM files WHERE owner_id=$1 AND project_id=$2`, [ownerId, projectId])).rows;
  const artifacts = (await client.query(`SELECT blob_key FROM artifacts WHERE owner_id=$1 AND project_id=$2`, [ownerId, projectId])).rows;
  for (const row of files) {
    if (!row.blob_key) continue;
    await client.query(`INSERT INTO blob_gc_queue(owner_id,store_name,blob_key,reason) VALUES($1,'olyhub-files',$2,'project-delete') ON CONFLICT(store_name,blob_key) DO NOTHING`, [ownerId, row.blob_key]);
  }
  for (const row of artifacts) {
    if (!row.blob_key) continue;
    await client.query(`INSERT INTO blob_gc_queue(owner_id,store_name,blob_key,reason) VALUES($1,'olyhub-artifacts',$2,'project-delete') ON CONFLICT(store_name,blob_key) DO NOTHING`, [ownerId, row.blob_key]);
  }
  return files.length + artifacts.length;
}

export async function queueBlobGc(db, ownerId, storeName, blobKey, reason='cleanup') {
  if (!blobKey) return;
  await db.sql`INSERT INTO blob_gc_queue(owner_id,store_name,blob_key,reason) VALUES(${ownerId},${storeName},${blobKey},${reason}) ON CONFLICT(store_name,blob_key) DO NOTHING`;
}

export async function drainBlobGc(db, ownerId, { limit=40 }={}) {
  const bounded=Math.max(1,Math.min(100,Number(limit)||40));
  const rows=await db.sql`
    SELECT id,store_name,blob_key,attempts
    FROM blob_gc_queue
    WHERE owner_id=${ownerId}
      AND attempts < 8
      AND (attempts=0 OR updated_at < now() - (interval '5 minutes' * LEAST(attempts,6)))
    ORDER BY created_at ASC
    LIMIT ${bounded}
  `;
  let deleted=0,failed=0;
  for (const row of rows) {
    try {
      await blobStore(row.store_name).delete(row.blob_key);
      await db.sql`DELETE FROM blob_gc_queue WHERE id=${row.id} AND owner_id=${ownerId}`;
      deleted += 1;
    } catch (error) {
      failed += 1;
      await db.sql`UPDATE blob_gc_queue SET attempts=attempts+1,last_error=${String(error?.message||error).slice(0,500)},updated_at=now() WHERE id=${row.id} AND owner_id=${ownerId}`;
    }
  }
  const [pending]=await db.sql`SELECT count(*)::int AS count FROM blob_gc_queue WHERE owner_id=${ownerId}`;
  return { attempted:rows.length,deleted,failed,pending:Number(pending?.count||0) };
}

export async function opportunisticDrainBlobGc(db, ownerId, { limit=5 }={}) {
  const [queued]=await db.sql`SELECT count(*)::int AS count FROM blob_gc_queue WHERE owner_id=${ownerId}`;
  const pending=Number(queued?.count||0);
  if (!pending) return { attempted:0,deleted:0,failed:0,pending:0,skipped:true };
  return drainBlobGc(db, ownerId, { limit });
}

export async function storageHealth(db, ownerId, { sample=30 }={}) {
  const files=await db.sql`SELECT id,blob_key FROM files WHERE owner_id=${ownerId} ORDER BY created_at DESC LIMIT ${Math.max(1,Math.min(50,sample))}`;
  const artifacts=await db.sql`SELECT id,blob_key FROM artifacts WHERE owner_id=${ownerId} ORDER BY created_at DESC LIMIT ${Math.max(1,Math.min(50,sample))}`;
  let missingFiles=0,missingArtifacts=0,probeErrors=0;
  for (const row of files) { try { if (!(await blobStore('olyhub-files').getMetadata(row.blob_key))) missingFiles += 1; } catch { probeErrors += 1; } }
  for (const row of artifacts) { try { if (!(await blobStore('olyhub-artifacts').getMetadata(row.blob_key))) missingArtifacts += 1; } catch { probeErrors += 1; } }
  const [queued]=await db.sql`SELECT count(*)::int AS count FROM blob_gc_queue WHERE owner_id=${ownerId}`;
  return { sampledFiles:files.length,sampledArtifacts:artifacts.length,missingFiles,missingArtifacts,probeErrors,pendingGc:Number(queued?.count||0) };
}
