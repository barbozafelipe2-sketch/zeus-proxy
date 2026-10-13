import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExecutionBudget } from '../netlify/functions/_shared/runtime.mjs';
import { MEMORY_POLICY, selectMemoryContext, formatMemoryContext } from '../netlify/functions/_shared/memory.mjs';

const now=Date.now(),memories=[];
for(let i=0;i<45;i++)memories.push({id:`m${i}`,type:'manual_note',content:`manual ${i}`,confidence:100,created_at:new Date(now-i*1000).toISOString()});
memories.push({id:'explicit-old',type:'explicit_instruction',content:'Never change the project identity.',confidence:100,created_at:new Date(now-9999999).toISOString()});
const selection=selectMemoryContext(memories);
assert.ok(selection.selected.length<=MEMORY_POLICY.maxItems);
assert.ok(selection.chars<=MEMORY_POLICY.maxChars);
assert.ok(selection.selected.some(m=>m.id==='explicit-old'));
assert.ok(formatMemoryContext(selection).includes('ranked by type priority, confidence, then recency'));

const reserveBudget=createExecutionBudget({startedAt:Date.now(),timeoutMs:10000,maxCalls:5,reserveMs:1000});
assert.equal(reserveBudget.canCall(1200,9000),false);
assert.throws(()=>reserveBudget.reserveCall('review',9000),e=>e?.code==='EXECUTION_BUDGET_EXHAUSTED');

const modelsSource=readFileSync('netlify/functions/_shared/models.mjs','utf8'),chatSource=readFileSync('netlify/functions/chat.mjs','utf8');
assert.ok(modelsSource.includes("strategy:'zeus_simple_single_model'"));
assert.ok(modelsSource.includes("strategy:'zeus_compound_base_gpt_finalizer'"));
assert.ok(modelsSource.includes('zeusBaseCandidates'));
assert.ok(modelsSource.includes('gptFinisherCandidates'));
assert.ok(modelsSource.includes("strategy:'scoped_specialists_director_adversary_patch'"));
assert.ok(!modelsSource.includes("strategy:verify?'author_adversary_patch':'single_author'"));
assert.ok(chatSource.includes("level:zeusLevel||'COMPOUND'"));
assert.ok(chatSource.includes('pipelineLabel:result.pipelineLabel||null'));

globalThis.Netlify={env:{get(name){return ({
  OPENAI_API_KEY:'openai-test',
  OPENAI_BASE_URL:'https://openai.test/v1',
  OPENAI_STRONG_MODEL:'gpt-5.6-sol',
  OPENAI_MODEL:'gpt-5.6-luna',
})[name]||'';}}};

const originalFetch=globalThis.fetch;
try{
  const models=await import(`../netlify/functions/_shared/models.mjs?phase2=${Date.now()}`);
  models.__resetProviderHealthForTests();

  let calls=[];
  globalThis.fetch=async(url,options={})=>{
    const body=JSON.parse(String(options.body||'{}'));calls.push(body.model);
    return new Response(JSON.stringify({choices:[{message:{content:'SIMPLE ANSWER'}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const simple=await models.runZeus({
    text:'Hello',
    level:'SIMPLE',
    requirements:{items:[],ambiguous:true},
    budget:createExecutionBudget({timeoutMs:20000,maxCalls:4,reserveMs:1000}),
  });
  assert.equal(simple.content,'SIMPLE ANSWER');
  assert.equal(simple.trace.strategy,'zeus_simple_single_model');
  assert.equal(simple.trace.executionLevel,'SIMPLE');
  assert.equal(calls.length,1,'Simple must make exactly one successful model call');
  assert.equal(calls[0],'gpt-5.6-luna','Simple should use the fast/economy GPT fallback when only OpenAI is configured');

  calls=[];
  globalThis.fetch=async(url,options={})=>{
    const body=JSON.parse(String(options.body||'{}'));calls.push(body.model);
    const content=body.model==='gpt-5.6-sol'?'FINAL GPT ANSWER':'BASE DRAFT';
    return new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const compound=await models.runZeus({
    text:'Implement this API endpoint safely',
    level:'COMPOUND',
    requirements:{items:[{id:'R1',text:'Implement the API endpoint safely.',evidence:'Implement this API endpoint safely',central:true}],ambiguous:true},
    budget:createExecutionBudget({timeoutMs:42000,maxCalls:6,reserveMs:1000}),
  });
  assert.equal(compound.content,'FINAL GPT ANSWER');
  assert.equal(compound.trace.strategy,'zeus_compound_base_gpt_finalizer');
  assert.equal(compound.trace.executionLevel,'COMPOUND');
  assert.equal(compound.trace.gptFinished,true);
  assert.equal(calls.length,2,'Compound must make one successful base call and one successful GPT finalizer call');
  assert.ok(['gpt-5.6-luna','gpt-4.1-mini'].includes(calls[0]),'Compound base must use an economy GPT when only OpenAI is configured');
  assert.notEqual(calls[0],'gpt-5.6-sol','Compound must reserve the strong GPT for the finalizer');
  assert.equal(calls[1],'gpt-5.6-sol','Compound final answer must come from the strong GPT finalizer');
  assert.equal(compound.leadModel,'openai:gpt-5.6-sol');
}finally{
  globalThis.fetch=originalFetch;
  delete globalThis.Netlify;
}
console.log('Final Fix 2/3 + Zeus v3 phase-2 engine tests: PASS');
