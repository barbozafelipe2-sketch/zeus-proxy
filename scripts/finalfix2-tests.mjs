import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExecutionBudget } from '../netlify/functions/_shared/runtime.mjs';
import { MEMORY_POLICY, selectMemoryContext, formatMemoryContext } from '../netlify/functions/_shared/memory.mjs';

const now=Date.now();
const memories=[];
for(let i=0;i<45;i++)memories.push({id:`m${i}`,type:'manual_note',content:`manual ${i}`,confidence:100,created_at:new Date(now-i*1000).toISOString()});
memories.push({id:'explicit-old',type:'explicit_instruction',content:'Never change the project identity.',confidence:100,created_at:new Date(now-9999999).toISOString()});
memories.push({id:'duplicate',type:'manual_note',content:'  manual   1  ',confidence:100,created_at:new Date(now+1000).toISOString()});
const selection=selectMemoryContext(memories);
assert.ok(selection.selected.length<=MEMORY_POLICY.maxItems,'memory context must obey item cap');
assert.ok(selection.chars<=MEMORY_POLICY.maxChars,'memory context must obey character cap');
assert.ok(selection.selected.some(m=>m.id==='explicit-old'),'explicit instructions must outrank recency-only notes');
assert.equal(selection.selected.filter(m=>String(m.content).trim().replace(/\s+/g,' ')==='manual 1').length,1,'normalized duplicate memories must collapse deterministically');
assert.ok(formatMemoryContext(selection).includes('ranked by type priority, confidence, then recency'));

const reserveBudget=createExecutionBudget({startedAt:Date.now(),timeoutMs:10000,maxCalls:5,reserveMs:1000});
assert.equal(reserveBudget.canCall(1200,9000),false,'phase reserve must protect future director time');
assert.throws(()=>reserveBudget.reserveCall('specialist',9000),e=>e?.code==='EXECUTION_BUDGET_EXHAUSTED');

const modelsSource=readFileSync('netlify/functions/_shared/models.mjs','utf8');
const healthSource=readFileSync('netlify/functions/health.mjs','utf8');
const storageSource=readFileSync('netlify/functions/_shared/storage.mjs','utf8');
const fileDownload=readFileSync('netlify/functions/file-download.mjs','utf8');
const artifactDownload=readFileSync('netlify/functions/artifact-download.mjs','utf8');
const chatSource=readFileSync('netlify/functions/chat.mjs','utf8');

assert.ok(modelsSource.includes('reviewedAfterFallback'),'Zeus must record review after a fallback lead');
assert.ok(!modelsSource.includes('level >= 2 && lead.attempts.length === 0'),'Zeus review must not be disabled just because the lead used fallback');
assert.ok(modelsSource.includes('OLYMPUS_DIRECTOR_RESERVE_MS'),'Olympus must reserve wall-clock time for the Director');
assert.ok(modelsSource.includes('reserveAfterMs: OLYMPUS_DIRECTOR_RESERVE_MS'),'specialists/critics must preserve Director time');
assert.ok(modelsSource.includes("ui_ux: 'reasoning'"),'UI/UX should not be hard-wired to a writing-only need');
assert.ok(modelsSource.includes('DIVERSITY_SCORE_TOLERANCE'),'provider diversity must be a bounded preference rather than a blind rule');
assert.ok(chatSource.includes('selectMemoryContext(memories)'),'chat must use the deterministic memory policy');
assert.ok(healthSource.includes("started_at > now() - interval '24 hours'"),'provider readiness must use persisted recent execution evidence');
assert.ok(healthSource.includes('opportunisticDrainBlobGc'),'normal app health checks must advance queued Blob cleanup');
assert.ok(storageSource.includes("attempts < 8"),'Blob cleanup retries must be bounded');
assert.ok(storageSource.includes("interval '5 minutes' * LEAST(attempts,6)"),'Blob cleanup retries must back off');
for(const source of [fileDownload,artifactDownload]){
  assert.ok(source.includes('getRequestId'),'download endpoint missing correlation id');
  assert.ok(source.includes('errorJson'),'download endpoint missing shared error contract');
  assert.ok(source.includes('RUNTIME_FAILURE'),'download endpoint missing runtime failure shield');
  assert.ok(source.includes('X-OlyHub-Request-Id'),'successful download missing correlation response header');
}

// Exercise Zeus through a real fallback -> review -> integration flow with mocked providers.
globalThis.Netlify={env:{get(name){return ({
  OPENAI_API_KEY:'openai-test',OPENAI_BASE_URL:'https://openai.test/v1',
  ANTHROPIC_API_KEY:'anthropic-test',ANTHROPIC_BASE_URL:'https://anthropic.test',
})[name]||'';}}};
const originalFetch=globalThis.fetch;
let providerCalls=0;
globalThis.fetch=async(url,options={})=>{
  providerCalls++;
  if(String(url).includes('anthropic.test'))return new Response(JSON.stringify({error:{message:'synthetic upstream failure'}}),{status:500,headers:{'content-type':'application/json'}});
  const body=JSON.parse(String(options.body||'{}'));
  const system=body.messages?.[0]?.content||'';
  let content='ZEUS DRAFT';
  if(String(system).includes('bounded specialist'))content='SPECIALIST REVIEW';
  if(/Produce (?:the|one) final answer/.test(String(system)))content='FINAL INTEGRATED ANSWER';
  return new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200,headers:{'content-type':'application/json'}});
};
try{
  const models=await import(`../netlify/functions/_shared/models.mjs?finalfix2=${Date.now()}`);
  const result=await models.runZeus({text:'Build and audit a secure production web app with architecture, database, implementation, UI, risks, and a detailed plan.'});
  assert.equal(result.content,'FINAL INTEGRATED ANSWER');
  assert.equal(result.trace.escalated,true,'complex Zeus request should still review after lead fallback');
  assert.equal(result.trace.reviewedAfterFallback,true,'trace should prove the review happened after fallback');
  assert.equal(result.trace.fallbacks.length,1,'synthetic lead should have exactly one failed provider before fallback');
  assert.equal(providerCalls,4,'bounded Zeus fallback+review+integration should consume four calls, not an unbounded chain');
}finally{globalThis.fetch=originalFetch;delete globalThis.Netlify;}

console.log('Final Fix 2/3 intelligence-memory-runtime tests: PASS');
