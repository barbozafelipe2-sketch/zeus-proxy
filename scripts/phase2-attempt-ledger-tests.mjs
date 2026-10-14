// 2/7: every execution attempt consumes an hourly reservation, even with the same request ID.
// Uses a transaction-aware fake Postgres client; no DB connection or AI network calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {withTransaction} from '../netlify/functions/_shared/db.mjs';
import {aiLimits,lockAiExecutionOwner,guardAiExecution,recordAiExecutionAttempt} from '../netlify/functions/_shared/limits.mjs';

const env={};
globalThis.Netlify={env:{get:key=>env[key]||''}};
const ownerId='owner-fixture',executionId='11111111-1111-4111-8111-111111111111';
let rows=[],others=[],lockCalls=0;
const client={
  pending:null,
  async query(sql,params=[]){
    const q=String(sql);
    if(q==='BEGIN'){this.pending=[];return {rows:[],rowCount:0};}
    if(q==='COMMIT'){rows.push(...this.pending);this.pending=null;return {rows:[],rowCount:0};}
    if(q==='ROLLBACK'){this.pending=null;return {rows:[],rowCount:0};}
    if(q.includes('pg_advisory_xact_lock')){lockCalls++;return {rows:[],rowCount:1};}
    if(q.includes('count(*) FILTER')){
      const remaining=others.filter(x=>x.id!==params[1]);
      return {rows:[{zeus:remaining.filter(x=>x.mode==='ZEUS').length,olympus:remaining.filter(x=>x.mode==='OLYMPUS').length}]};
    }
    if(q.includes('count(*)::int AS total FROM execution_attempts')){
      const available=[...rows,...(this.pending||[])];
      return {rows:[{total:available.filter(x=>x.ownerId===params[0]&&x.mode===params[1]).length}]};
    }
    if(q.includes('INSERT INTO execution_attempts(')){
      if(!this.pending)throw new Error('Attempt write outside transaction.');
      this.pending.push({ownerId:params[0],executionId:params[1],mode:params[2],kind:params[3]});
      return {rows:[],rowCount:1};
    }
    throw new Error('Unexpected SQL '+q);
  }
};
const db={pool:{async connect(){return {...client,release(){}};}}};
// Shared mutable state for transactions, same way a real PG pool client holds its transaction.
db.pool.connect=async()=>{client.release=()=>{};return client;};
async function admit(kind='retry',mode='ZEUS',id=executionId,{abort=false}={}){
  return withTransaction(db,async tx=>{
    await lockAiExecutionOwner(tx,ownerId);
    await guardAiExecution(tx,ownerId,mode,'reused-id',{excludeExecutionId:id});
    await recordAiExecutionAttempt(tx,ownerId,mode,id,kind);
    if(abort)throw new Error('simulate rollback after attempting to reserve');
  });
}
assert.equal(aiLimits('ZEUS').hourly,15);
assert.equal(aiLimits('OLYMPUS').hourly,3);
await admit('initial');
for(let i=0;i<14;i++)await admit('retry');
assert.equal(rows.length,15,'all 15 runs/retries must be persisted, even same execution ID');
assert.equal(rows.filter(x=>x.kind==='retry').length,14);
await assert.rejects(()=>admit('retry'),e=>e.code==='AI_RATE_LIMIT'&&e.status===429);
assert.equal(rows.length,15,'16th re-execution blocked without new ledger row');
assert.equal(lockCalls,16,'every admission is protected by owner transaction lock');
assert.equal(new Set(rows.map(x=>x.executionId)).size,1,'the same execution is counted repeatedly');
await assert.rejects(()=>admit('initial','OLYMPUS',executionId,{abort:true}),/simulate rollback/);
assert.equal(rows.filter(x=>x.mode==='OLYMPUS').length,0,'rolled-back attempts are not charged');
for(let i=0;i<3;i++)await admit(i===0?'initial':'retry','OLYMPUS');
await assert.rejects(()=>admit('retry','OLYMPUS'),e=>e.code==='AI_RATE_LIMIT');
assert.equal(rows.filter(x=>x.mode==='OLYMPUS').length,3,'Olympus default 3/h enforced');
env.OLYHUB_ZEUS_HOURLY_LIMIT='20';
others=[{id:'other-A',mode:'ZEUS'},{id:'other-B',mode:'ZEUS'}];
await assert.rejects(()=>admit('retry'),e=>e.code==='AI_CONCURRENCY_LIMIT');
others=[{id:executionId,mode:'ZEUS'}];
await admit('retry'); // Same existing execution must not block its own resumed attempt.
assert.equal(rows.length,19);
delete env.OLYHUB_ZEUS_HOURLY_LIMIT;

const chat=readFileSync('netlify/functions/chat.mjs','utf8');
const limits=readFileSync('netlify/functions/_shared/limits.mjs','utf8');
const migration=readFileSync('netlify/database/migrations/20261014043000_ai_execution_attempt_ledger/migration.sql','utf8');
assert.ok(chat.includes('await lockAiExecutionOwner(client,userId)'));
assert.ok(chat.includes("recordAiExecutionAttempt(client,userId,mode,execution.id,'initial')"));
assert.ok(chat.includes("recordAiExecutionAttempt(client,userId,mode,existing.id,'retry')"));
assert.ok(chat.includes("if(worker){")&&chat.includes('const claimed=await claimOlympusWorker(client,'),'QUEUED handoff must be an exclusive claim, not a charged retry');
assert.ok(chat.indexOf("if(existing.state==='COMPLETED'||existing.state==='PARTIAL')return")<chat.indexOf("recordAiExecutionAttempt(client,userId,mode,existing.id,'retry')"),'completed replay must bypass admission');
assert.ok(limits.includes('FROM execution_attempts WHERE owner_id=$1 AND mode=$2'));
assert.ok(!limits.includes('FROM executions WHERE owner_id=$1 AND mode=$2 AND started_at > now()'),'count must not use unique request ID rows');
assert.equal((migration.match(/CREATE TABLE IF NOT EXISTS execution_attempts/g)||[]).length,1);
assert.ok(migration.includes("attempt_kind IN ('initial','retry')"));
assert.ok(migration.includes('REFERENCES executions(id) ON DELETE CASCADE'));
console.log('Phase 2/7: retries billed in separate rows, hourly cap, concurrency, rollback and worker handoff: PASS');
