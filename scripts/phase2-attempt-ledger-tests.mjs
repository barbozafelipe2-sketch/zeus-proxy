// 2/7: every execution attempt is recorded for auditing; there is no hourly execution cap.
// Uses a transaction-aware fake Postgres client; no DB connection or AI network calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {withTransaction} from '../netlify/functions/_shared/db.mjs';
import {aiLimits,lockAiExecutionOwner,guardAiExecution,recordAiExecutionAttempt} from '../netlify/functions/_shared/limits.mjs';

const env={};
globalThis.Netlify={env:{get:key=>env[key]||''}};
const ownerId='owner-fixture',executionId='11111111-1111-4111-8111-111111111111';
let rows=[],others=[],lockCalls=0,hourlyLookups=0;
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
    if(q.includes('FROM execution_attempts WHERE owner_id=$1 AND mode=$2')){hourlyLookups++;throw new Error('Hourly cap lookup must be removed.');}
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
assert.equal(aiLimits('ZEUS').concurrent,2);
assert.equal(aiLimits('OLYMPUS').concurrent,1);
assert.equal('hourly' in aiLimits('ZEUS'),false,'Zeus must have no per-hour cap');
assert.equal('hourly' in aiLimits('OLYMPUS'),false,'Olympus must have no per-hour cap');
await admit('initial');
for(let i=0;i<40;i++)await admit('retry');
assert.equal(rows.length,41,'more than 15 runs/retries must be admitted and recorded');
assert.equal(rows.filter(x=>x.kind==='retry').length,40);
assert.equal(lockCalls,41,'every admission is protected by owner transaction lock');
assert.equal(new Set(rows.map(x=>x.executionId)).size,1,'the same execution is counted repeatedly');
await assert.rejects(()=>admit('initial','OLYMPUS',executionId,{abort:true}),/simulate rollback/);
assert.equal(rows.filter(x=>x.mode==='OLYMPUS').length,0,'rolled-back attempts are not charged');
for(let i=0;i<8;i++)await admit(i===0?'initial':'retry','OLYMPUS');
assert.equal(rows.filter(x=>x.mode==='OLYMPUS').length,8,'more than three Olympus runs must be admitted and recorded');
assert.equal(hourlyLookups,0,'admission must never query the execution ledger for an hourly cap');
env.OLYHUB_ZEUS_CONCURRENCY='3';assert.equal(aiLimits('ZEUS').concurrent,3);
others=[{id:'other-A',mode:'ZEUS'},{id:'other-B',mode:'ZEUS'}];
await admit('retry');
assert.equal(rows.length,50);
others.push({id:'other-C',mode:'ZEUS'});
await assert.rejects(()=>admit('retry'),e=>e.code==='AI_CONCURRENCY_LIMIT');
others=[{id:executionId,mode:'ZEUS'}];
await admit('retry'); // Same existing execution must not block its own resumed attempt.
assert.equal(rows.length,51);
delete env.OLYHUB_ZEUS_CONCURRENCY;

const chat=readFileSync('netlify/functions/chat.mjs','utf8');
const limits=readFileSync('netlify/functions/_shared/limits.mjs','utf8');
const migration=readFileSync('netlify/database/migrations/20261014043000_ai_execution_attempt_ledger/migration.sql','utf8');
const cleanupMigration=readFileSync('netlify/database/migrations/20261024093000_remove_unused_execution_attempt_index/migration.sql','utf8');
assert.ok(chat.includes('await lockAiExecutionOwner(client,userId)'));
assert.ok(chat.includes("recordAiExecutionAttempt(client,userId,mode,execution.id,'initial')"));
assert.ok(chat.includes("recordAiExecutionAttempt(client,userId,mode,existing.id,'retry')"));
assert.ok(chat.includes("if(worker){")&&chat.includes('const claimed=await claimOlympusWorker(client,'),'QUEUED handoff must be an exclusive claim, not a charged retry');
assert.ok(chat.indexOf("if(existing.state==='COMPLETED'||existing.state==='PARTIAL')return")<chat.indexOf("recordAiExecutionAttempt(client,userId,mode,existing.id,'retry')"),'completed replay must bypass admission');
assert.ok(!limits.includes('FROM execution_attempts WHERE owner_id=$1 AND mode=$2'),'attempt ledger is audit-only and must not enforce an hourly cap');
assert.ok(!limits.includes('FROM executions WHERE owner_id=$1 AND mode=$2 AND started_at > now()'),'count must not use unique request ID rows');
assert.equal((migration.match(/CREATE TABLE IF NOT EXISTS execution_attempts/g)||[]).length,1);
assert.ok(migration.includes("attempt_kind IN ('initial','retry')"));
assert.ok(migration.includes('REFERENCES executions(id) ON DELETE CASCADE'));
assert.ok(cleanupMigration.includes('DROP INDEX IF EXISTS execution_attempts_hourly_idx'));
console.log('Phase 2/7: unlimited hourly executions, audit ledger, concurrency, rollback and worker handoff: PASS');
