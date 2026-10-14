// Phase 4/7 worker lease & finalization fencing. No network or paid AI calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OLYMPUS_QUEUE_LEASE_MS,OLYMPUS_WORKER_LEASE_MS,OLYMPUS_LEGACY_STALE_MS,executionLeaseExpired,queueOlympusExecution,claimOlympusWorker,claimInlineFallback,assertWorkerFence,markFailureIfOwner} from '../netlify/functions/_shared/worker-lease.mjs';
const uuid=n=>n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
let serial=1;const gen=()=>uuid(serial++),ownerId='owner',executionId=uuid(900);
const e={state:'UNDERSTANDING',ownerId,dispatch:null,worker:null,expires:0};
const args={ownerId,executionId};
const db={async sql(parts,...p){
 const q=parts.join('?');
 if(q.includes("SET state='QUEUED'")){
  if(p[1]!==ownerId||e.state!=='UNDERSTANDING'||e.worker)return [];
  e.state='QUEUED';e.dispatch=gen();e.expires=Date.now()+OLYMPUS_QUEUE_LEASE_MS;return [{dispatch_token:e.dispatch}];
 }
 if(q.includes("SET state='UNDERSTANDING'")){
  if(p[1]!==ownerId||e.state!=='QUEUED'||e.dispatch!==p[2]||e.worker||e.expires<=Date.now())return [];
  e.state='UNDERSTANDING';e.dispatch=null;e.worker=gen();e.expires=Date.now()+90000;
  return [{worker_token:e.worker,lease_expires_at:new Date(e.expires)}];
 }
 if(q.includes("SET state='FAILED'")){
  const guarded=q.includes('AND worker_token=?::uuid');
  if((guarded&&e.worker!==p[4])||(!guarded&&e.worker)||e.expires<=Date.now()&&guarded)return [];
  e.state='FAILED';e.worker=null;return [{id:executionId}];
 }
 throw Error('Unrecognized tagged SQL '+q.slice(0,90));
}};
const client={async query(q,p){
 if(q.startsWith('UPDATE executions')){
  if(e.state!=='QUEUED'||e.worker||e.dispatch!==p[2]||e.expires<=Date.now())return {rows:[],rowCount:0};
  e.state='UNDERSTANDING';e.worker=gen();e.expires=Date.now()+OLYMPUS_WORKER_LEASE_MS;
  return {rows:[{id:executionId,worker_token:e.worker,lease_expires_at:new Date(e.expires)}],rowCount:1};
 }
 if(q.startsWith('SELECT id FROM executions')){
  assert.ok(q.includes('FOR UPDATE'),'fence must keep lock through commit');
  const okay=e.worker===p[2]&&e.expires>Date.now()&&e.state==='UNDERSTANDING';
  return {rows:okay?[{id:executionId}]:[],rowCount:okay?1:0};
 }
 throw Error('Unknown client SQL');
}};
assert.ok(OLYMPUS_WORKER_LEASE_MS>150000&&OLYMPUS_QUEUE_LEASE_MS>OLYMPUS_WORKER_LEASE_MS);
const now=Date.now(),ago=n=>new Date(now-n).toISOString();
assert.equal(executionLeaseExpired({mode:'OLYMPUS',started_at:ago(100000)},now),false);
assert.equal(executionLeaseExpired({mode:'OLYMPUS',started_at:ago(OLYMPUS_LEGACY_STALE_MS+1)},now),true);
assert.equal(executionLeaseExpired({mode:'OLYMPUS',lease_expires_at:new Date(now+50000).toISOString()},now),false);
assert.equal(executionLeaseExpired({mode:'OLYMPUS',lease_expires_at:new Date(now-1).toISOString()},now),true);
assert.equal(executionLeaseExpired({mode:'ZEUS',started_at:ago(100000)},now),true);
const firstDispatch=await queueOlympusExecution(db,args);
const workers=await Promise.all([claimOlympusWorker(client,{...args,dispatchToken:firstDispatch}),claimOlympusWorker(client,{...args,dispatchToken:firstDispatch})]);
assert.equal(workers.filter(Boolean).length,1,'only one worker claims a dispatch');
const first=workers.find(Boolean);
assert.equal(await claimInlineFallback(db,{...args,dispatchToken:firstDispatch}),null,'lost ACK cannot trigger simultaneous Zeus');
await assertWorkerFence(client,{...args,workerToken:first.worker_token});
assert.equal(await markFailureIfOwner(db,{...args,workerToken:uuid(400),errorCode:'X',trace:{}}),false);
e.expires=Date.now()-1000;
await assert.rejects(()=>assertWorkerFence(client,{...args,workerToken:first.worker_token}),x=>x.code==='WORKER_LEASE_CONFLICT');
assert.equal(await markFailureIfOwner(db,{...args,workerToken:first.worker_token,errorCode:'X',trace:{}}),false);
e.state='UNDERSTANDING';e.worker=null;e.dispatch=null;
const newDispatch=await queueOlympusExecution(db,args);
assert.notEqual(newDispatch,firstDispatch);
assert.equal(await claimOlympusWorker(client,{...args,dispatchToken:firstDispatch}),null,'late worker cannot claim new generation');
const second=await claimOlympusWorker(client,{...args,dispatchToken:newDispatch});
assert.ok(second?.worker_token!==first.worker_token);
assert.equal(await markFailureIfOwner(db,{...args,workerToken:first.worker_token,errorCode:'X',trace:{}}),false,'stale old worker cannot poison next generation');
assert.equal(e.state,'UNDERSTANDING');
await assertWorkerFence(client,{...args,workerToken:second.worker_token});
e.state='UNDERSTANDING';e.worker=null;e.dispatch=null;
const inlineDispatch=await queueOlympusExecution(db,args);
const fallback=await claimInlineFallback(db,{...args,dispatchToken:inlineDispatch});
assert.ok(fallback?.worker_token);
assert.equal(await claimOlympusWorker(client,{...args,dispatchToken:inlineDispatch}),null,'late worker blocked after Zeus fallback');
await assertWorkerFence(client,{...args,workerToken:fallback.worker_token});
const chat=readFileSync('netlify/functions/chat.mjs','utf8'),lease=readFileSync('netlify/functions/_shared/worker-lease.mjs','utf8'),sql=readFileSync('netlify/database/migrations/20261014050000_olympus_worker_leases/migration.sql','utf8');
assert.ok(chat.includes('worker?{rowCount:0,rows:[]}'),'background cannot create a new execution');
assert.ok(chat.includes('claimOlympusWorker(client,')&&chat.includes('executionLeaseExpired(existing)'));
assert.ok(chat.includes('claimInlineFallback(db,')&&chat.includes('assertWorkerFence(client,'));
assert.ok(chat.indexOf('assertWorkerFence(client,')<chat.indexOf('for(const staged of stagedArtifacts){'));
assert.ok(chat.includes('userMessageId:init.userMessage?.id||null'),'failed marker must be written only by the fenced owner');
assert.ok(lease.includes('WITH owned AS (')&&lease.includes('execution_id IN (SELECT id FROM owned)'),'execution failure and user-message marker must be atomic');
assert.ok(lease.includes('AND dispatch_token=$3::uuid'));
assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS dispatch_token uuid')&&sql.includes('ADD COLUMN IF NOT EXISTS worker_token uuid')&&sql.includes('ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz'));
console.log('Phase 4/7: exclusive worker claim, deadline-safe leases, fencing and lost-ACK fallback: PASS');
