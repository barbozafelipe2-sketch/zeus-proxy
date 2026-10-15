import assert from 'node:assert/strict';
import { createExecutionBudget } from '../netlify/functions/_shared/runtime.mjs';
import { GEAR_CALL_CAPS, decideExecutionLevel } from '../netlify/functions/_shared/intent.mjs';
import { snapshotProviderTelemetry, summarizeRequestUsage } from '../netlify/functions/_shared/provider-observability.mjs';

const envVars={OPENAI_API_KEY:'openai-test',OPENAI_BASE_URL:'https://openai.test/v1',OPENAI_STRONG_MODEL:'gpt-5.6-sol',OPENAI_MODEL:'gpt-5.6-luna',ANTHROPIC_API_KEY:'anthropic-test',ANTHROPIC_BASE_URL:'https://anthropic.test'};
globalThis.Netlify={env:{get:(n)=>envVars[n]||''}};
const originalFetch=globalThis.fetch;
let calls=[],failAll=false;
globalThis.fetch=async(url,options={})=>{
  const target=String(url),body=JSON.parse(String(options.body||'{}'));
  const system=String(body.system||body.messages?.[0]?.content||'');
  calls.push({target,model:body.model,system});
  assert.ok(!/PLANNER role/i.test(system),'no Planner call is allowed');
  if(failAll)return new Response(JSON.stringify({error:{message:'boom'}}),{status:500,headers:{'content-type':'application/json'}});
  if(target.includes('anthropic.test'))return new Response(JSON.stringify({content:[{type:'text',text:'ANTHROPIC OUT'}],usage:{input_tokens:100,output_tokens:50}}),{status:200,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({choices:[{message:{content:'OPENAI OUT'}}],usage:{prompt_tokens:200,completion_tokens:80}}),{status:200,headers:{'content-type':'application/json'}});
};
const budget=(level)=>createExecutionBudget({timeoutMs:60000,maxCalls:GEAR_CALL_CAPS[level],reserveMs:1000});
const req={items:[{id:'R1',text:'Write a business plan PDF.',evidence:'PDF',central:true}],ambiguous:false};
const reset=(m)=>{calls=[];m.__resetProviderHealthForTests();};
try{
  assert.deepEqual({...GEAR_CALL_CAPS},{SIMPLE:1,COMPOUND:2,ZEUS_DIRECTED:3,COMPOUND_PLUS:3,COMPLEX_TURBO:4});
  // Router decisions are deterministic: no classifier call, token charge or network request.
  const beforeRouting=calls.length;
  for(const request of ['Write chapter 7 of my book, about 2500 characters.',
    'Escreva o capítulo 7 do livro com 2500 caracteres.',
    'Draft another chapter in the novel.',
    'Escribe el capitulo 4 de mi libro.']){
    const route=decideExecutionLevel(request,{mode:'ZEUS',action:'CHAT',route:'fast'});
    assert.equal(route.level,'COMPOUND',request);
    assert.equal(route.maxCalls,2);
    assert.equal(route.router,'deterministic_zero_token');
  }
  assert.equal(decideExecutionLevel('Hello, how are you?',{mode:'ZEUS'}).level,'SIMPLE');
  assert.equal(decideExecutionLevel('Read chapter 7 and explain its meaning.',{mode:'ZEUS'}).level,'SIMPLE');
  assert.equal(calls.length,beforeRouting,'zero cost router must never make outbound calls');

  const models=await import(`../netlify/functions/_shared/models.mjs?gears=${Date.now()}`);
  assert.equal(models.TURBO_LIMITS.maxCalls,4);assert.equal(models.TURBO_LIMITS.maxCreators,2);

  for(const fail of [false,true]){
    failAll=fail;
    reset(models);try{await models.runZeus({text:'oi',level:'SIMPLE',budget:budget('SIMPLE')});}catch{}
    assert.ok(calls.length<=1,`Simple must be 1 call (fail=${fail}), got ${calls.length}`);
    reset(models);try{await models.runZeus({text:'Cria um PDF com um plano de negócios',requirements:req,level:'COMPOUND',budget:budget('COMPOUND')});}catch{}
    assert.ok(calls.length<=2,`Compound must be <=2 calls (fail=${fail}), got ${calls.length}`);
    reset(models);try{await models.runOlympusCompoundPlus({text:'Relatório para investidores',requirements:req,budget:budget('COMPOUND_PLUS')});}catch{}
    assert.ok(calls.length<=3,`Compound Plus must be <=3 calls (fail=${fail}), got ${calls.length}`);
    reset(models);try{await models.runOlympus({text:'frontend backend database commit',requirements:req,creatorCount:9,budget:budget('COMPLEX_TURBO')});}catch{}
    assert.ok(calls.length<=4,`Turbo must be <=4 calls (fail=${fail}), got ${calls.length}`);
  }
  failAll=false;

  // Cost tiering: specialists cheap, CEO top model.
  const creators=models.roleCandidates('CREATOR','write a report');
  assert.notEqual(creators[0].tier,'premium','specialists must use the cheap tier');
  const director=models.roleCandidates('DIRECTOR','write a report');
  assert.notEqual(director[0].tier,'premium','manager must use the mid/cheap tier');
  const ceo=models.roleCandidates('CEO','write a report');
  assert.equal(ceo[0].tier,'premium','only the CEO uses the top model');
  assert.ok(ceo.length>=1&&creators.length>=1,'multi-provider fallback lists remain');

  // Zeus Compound must never use the same originating model family twice.
  // Check the pure selector as well as the actual two-call handoff.
  const {modelFamily}=await import('../netlify/functions/_shared/provider-routing.mjs');
  const starter={provider:'openai',id:'gpt-4.1-mini'};
  const independent=models.zeusIndependentFinisherCandidates('Cria um PDF',starter);
  assert.ok(independent.every(candidate=>modelFamily(candidate)!=='openai'),'same-family finisher must be excluded');
  const uiCandidates=models.zeusIndependentFinisherCandidates('Fix the UI layout',starter);
  assert.ok(uiCandidates.every(candidate=>modelFamily(candidate)!=='openai'),'UI fallback must also exclude starter family');
  reset(models);
  const paired=await models.runZeus({text:'Cria um PDF com um plano de negócios',requirements:req,level:'COMPOUND',budget:budget('COMPOUND')});
  assert.equal(calls.length,2,'Compound requires exactly two successful role calls');
  assert.equal(paired.trace.independentFamilies,true,'Compound must report distinct families');
  assert.notEqual(modelFamily(paired.trace.base),modelFamily(paired.trace.finalizer),'base and finisher must be different families');
  assert.ok(Number.isInteger(paired.trace.budget.calls)&&paired.trace.budget.calls<=2,'no extra hidden classifier or retry call');

  // Usage capture + summary (no prompts stored).
  reset(models);
  const b=budget('COMPOUND');
  await models.runZeus({text:'Cria um PDF com um plano de negócios',requirements:req,level:'COMPOUND',budget:b});
  const usage=summarizeRequestUsage(snapshotProviderTelemetry(b),{maxCalls:2,webUsage:{inputTokens:10,outputTokens:5}});
  assert.equal(usage.callsUsed,2);assert.equal(usage.maxCalls,2);
  assert.equal(usage.byRole.length,2);
  assert.ok(usage.inputTokens>=210&&usage.outputTokens>=85,'tokens summed incl. web search');
  assert.equal(usage.totalTokens,usage.inputTokens+usage.outputTokens);
  const hasPricedAttempts=usage.byRole.some(item=>item.estimatedUsd!==null);
  assert.equal(usage.estimateLabel,hasPricedAttempts?'known_subtotal':'unknown','Web charges and unpriced models cannot yield full cost coverage');
  assert.equal(usage.estimateCoverage,hasPricedAttempts?'partial':'none');
  assert.ok(!JSON.stringify(usage).includes('plano de neg'),'usage must not contain prompt text');
  const priced=summarizeRequestUsage({budgetCalls:1,attempts:[{stage:'zeus_simple',model:'gpt-4.1-mini',outcome:'success',inputTokens:1_000_000,outputTokens:1_000_000}]});
  assert.equal(priced.estimatedUsd,2);assert.equal(priced.estimateCoverage,'full');
  const unpriced=summarizeRequestUsage({budgetCalls:1,attempts:[{stage:'x',model:'unknown-model',outcome:'success',inputTokens:5,outputTokens:5}]});
  assert.equal(unpriced.estimatedUsd,null);assert.equal(unpriced.estimateCoverage,'none');
}finally{globalThis.fetch=originalFetch;delete globalThis.Netlify;}
console.log('4-gear hard call caps, cost tiering and per-request usage: PASS');
