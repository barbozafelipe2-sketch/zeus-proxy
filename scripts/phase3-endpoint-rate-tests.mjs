// 3/7: caller-supplied request IDs must not bypass endpoint rate budgets.
// All PostgreSQL behavior is mocked in-process; this suite does not contact any provider.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {consumeEndpointRate,endpointLimit} from '../netlify/functions/_shared/limits.mjs';

const previousNetlify=globalThis.Netlify;
globalThis.Netlify={env:{get:()=>''}};

function fakeDatabase(){
  const committed=[], inserted=[];let next=0,barrier=Promise.resolve();
  return {
    committed,
    pool:{async connect(){
      const client={pending:[],unlock:null,released:false,
        async query(sql,params=[]){
          const q=String(sql);
          if(q==='BEGIN'){this.pending=[];return {rowCount:0,rows:[]};}
          if(q.includes('pg_advisory_xact_lock')){
            // Serialize concurrent transactions the way PostgreSQL advisory locks do.
            const previous=barrier;
            barrier=new Promise(resolve=>{this.unlock=resolve;});
            await previous;
            return {rowCount:1,rows:[{}]};
          }
          if(q.includes('SELECT count(*)::int AS total FROM request_rate_events')){
            const count=committed.filter(e=>e.owner===params[0]&&e.kind===params[1]).length;
            return {rowCount:1,rows:[{total:count}]};
          }
          if(q.includes('INSERT INTO request_rate_events')){
            assert.ok(q.includes('gen_random_uuid()::text'),'each server-side event needs its own unique ID');
            assert.equal(params.length,2,'do not use a client-provided request ID as the event ID');
            const id='server-event-'+(++next);
            this.pending.push({owner:params[0],kind:params[1],request_id:id});
            inserted.push(id);
            return {rowCount:1,rows:[{id:next}]};
          }
          if(q.includes('DELETE FROM request_rate_events'))return {rowCount:0,rows:[]};
          if(q==='COMMIT'){committed.push(...this.pending);this.pending=[];this.unlock?.();this.unlock=null;return {rowCount:0,rows:[]};}
          if(q==='ROLLBACK'){this.pending=[];this.unlock?.();this.unlock=null;return {rowCount:0,rows:[]};}
          throw Error('Unknown SQL '+q);
        },
        release(){this.released=true;}
      };
      return client;
    }}
  };
}
try{
  const db=fakeDatabase();
  const sameId='client-can-repeat-forever';
  for(let i=0;i<3;i++)await consumeEndpointRate(db,'user','upload',sameId,3);
  assert.equal(db.committed.length,3,'repeated uploads must count as three operations');
  assert.equal(new Set(db.committed.map(x=>x.request_id)).size,3,'audit event IDs must be distinct');
  await assert.rejects(()=>consumeEndpointRate(db,'user','upload',sameId,3),e=>e.code==='RATE_LIMIT'&&e.status===429);
  await assert.rejects(()=>consumeEndpointRate(db,'user','upload','different-request-id',3),e=>e.code==='RATE_LIMIT');
  assert.equal(db.committed.length,3,'rejected requests never consume another event');
  for(const kind of ['transcribe','artifact','maintenance']){
    for(let i=0;i<2;i++)await consumeEndpointRate(db,'user',kind,sameId,2);
    await assert.rejects(()=>consumeEndpointRate(db,'user',kind,sameId,2),e=>e.code==='RATE_LIMIT');
    assert.equal(db.committed.filter(x=>x.kind===kind).length,2);
  }
  assert.equal(endpointLimit('google_read'),60,'Google reads have a bounded default hourly budget');
  for(let i=0;i<2;i++)await consumeEndpointRate(db,'user','google_read',sameId,2);
  await assert.rejects(()=>consumeEndpointRate(db,'user','google_read','another-request',2),e=>e.code==='RATE_LIMIT');
  assert.equal(db.committed.filter(x=>x.owner==='user'&&x.kind==='google_read').length,2);
  await consumeEndpointRate(db,'different-owner','upload',sameId,1); // independent owner
  assert.equal(db.committed.filter(x=>x.owner==='different-owner').length,1);
  // Competing requests must serialize budget admission, even with the same client ID.
  const concurrent=fakeDatabase();
  const results=await Promise.allSettled(Array.from({length:8},()=>consumeEndpointRate(concurrent,'user','transcribe',sameId,2)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,2,'concurrent requests cannot oversubscribe the limit');
  assert.equal(results.filter(x=>x.status==='rejected'&&x.reason?.code==='RATE_LIMIT').length,6);
  assert.equal(concurrent.committed.length,2);
  for(const path of ['netlify/functions/files.mjs','netlify/functions/transcribe.mjs','netlify/functions/artifacts.mjs','netlify/functions/storage-maintenance.mjs','netlify/functions/google-integration.mjs','netlify/functions/chat.mjs']){
    const src=readFileSync(path,'utf8');
    assert.ok(src.includes('await consumeEndpointRate('),path+' must charge endpoint admission');
  }
  const logic=readFileSync('netlify/functions/_shared/limits.mjs','utf8');
  assert.ok(!logic.includes('SELECT 1 FROM request_rate_events WHERE owner_id=$1 AND kind=$2 AND request_id=$3'), 'no client ID bypass');
  assert.ok(logic.includes('VALUES($1,$2,gen_random_uuid()::text)'),'unique event per actual operation');
  assert.ok(logic.includes('pg_advisory_xact_lock'),'count and reservation must be serialized');
  console.log('Phase 3/7: endpoint requestId cannot bypass limits, concurrent gate: PASS');
}finally{globalThis.Netlify=previousNetlify;}
