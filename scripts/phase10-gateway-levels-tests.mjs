import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createExecutionBudget} from '../netlify/functions/_shared/runtime.mjs';
import {modelFamily} from '../netlify/functions/_shared/provider-routing.mjs';

const previousFetch=globalThis.fetch,previousNetlify=globalThis.Netlify;
const vars={
  OPENAI_API_KEY:'gateway-openai-token',OPENAI_BASE_URL:'https://gateway-openai.test/v1',
  ANTHROPIC_API_KEY:'gateway-anthropic-token',ANTHROPIC_BASE_URL:'https://gateway-anthropic.test',
  GEMINI_API_KEY:'gateway-gemini-token',GOOGLE_GEMINI_BASE_URL:'https://gateway-gemini.test',
  OPENROUTER_API_KEY:'gateway-router-token',OPENROUTER_BASE_URL:'https://gateway-router.test/v1',
  OPENAI_DIRECT_API_KEY:'must-not-route',OPENROUTER_DIRECT_API_KEY:'must-not-route'
};
globalThis.Netlify={env:{get:key=>vars[key]||''}};
const calls=[];
globalThis.fetch=async(url,options={})=>{
  const target=String(url),body=String(options.body||'{}');
  calls.push({url:target,body,authorization:options.headers?.Authorization||options.headers?.['x-api-key']||''});
  if(target.includes('gateway-anthropic.test'))return new Response(JSON.stringify({content:[{type:'text',text:'DRAFT'}]}),{status:200});
  if(target.includes('gateway-gemini.test'))return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'DRAFT'}]}}]}),{status:200});
  return new Response(JSON.stringify({choices:[{message:{content:'DRAFT'}}]}),{status:200});
};

try{
  const models=await import(`../netlify/functions/_shared/models.mjs?gateway-levels=${Date.now()}`);
  models.__resetProviderHealthForTests();
  const onlyOpenRouter=await models.callModel({provider:'openrouter',id:'x-ai/grok-4.5',transport:'openrouter_direct'},'system','gateway check',{
    budget:createExecutionBudget({timeoutMs:30000,maxCalls:1})
  });
  assert.equal(onlyOpenRouter,'DRAFT');
  assert.equal(calls.at(-1).url,'https://gateway-router.test/v1/chat/completions');
  assert.equal(calls.at(-1).authorization,'Bearer gateway-router-token');

  const sentinel='SAME_WORK_SENTINEL: build a small chess game';
  calls.length=0;
  const l2=await models.runZeus({text:sentinel,level:'COMPOUND',requirements:{items:[]},budget:createExecutionBudget({timeoutMs:120000,maxCalls:2,reserveMs:500})});
  assert.equal(l2.trace.executionLevel,'COMPOUND');
  assert.ok(l2.trace.base&&l2.trace.finalizer,'L2 must return evidence for both real stages');
  assert.notEqual(modelFamily({provider:l2.trace.base.provider,id:l2.trace.base.model}),modelFamily({provider:l2.trace.finalizer.provider,id:l2.trace.finalizer.model}),'L2 finalizer must use an independent family');
  assert.equal(calls.length,2,'L2 must complete a base call and independent finalizer call');
  assert.ok(calls.every(call=>call.body.includes(sentinel)),'each L2 model receives the original work');

  calls.length=0;
  const l3=await models.runZeus({text:sentinel,level:'ZEUS_DIRECTED',requirements:{items:[]},budget:createExecutionBudget({timeoutMs:120000,maxCalls:3,reserveMs:500})});
  assert.equal(l3.trace.roles.length,3);
  assert.equal(new Set(l3.trace.roles.map(role=>role.family)).size,3,'L3 roles must use three independent model families');
  assert.ok(l3.trace.roles.every(role=>role.transport==='gateway'));
  assert.equal(calls.length,3,'L3 must issue three actual model requests');
  assert.ok(calls.every(call=>call.body.includes(sentinel)),'each L3 model receives the original work');
  assert.ok(calls.every(call=>call.url.includes('.test/')),'L3 must use the Gateway endpoints only');

  calls.length=0;
  const olympus=await models.runOlympusCompoundPlus({text:sentinel,requirements:{items:[]},budget:createExecutionBudget({timeoutMs:150000,maxCalls:3,reserveMs:500})});
  assert.ok(olympus.trace.author&&olympus.trace.critic&&olympus.trace.finalizer,'Olympus must complete author, critic, and finalizer stages');
  const olympusFamilies=[olympus.trace.author,olympus.trace.critic,olympus.trace.finalizer].map(stage=>modelFamily({provider:stage.provider,id:stage.model}));
  assert.equal(new Set(olympusFamilies).size,3,'Olympus stages must use three independent model families');
  assert.equal(calls.length,3,'Olympus must issue three actual model requests');
  assert.ok(calls.every(call=>call.body.includes(sentinel)),'each Olympus model receives the original work');
  assert.ok(calls.every(call=>call.url.includes('.test/')),'Olympus must use Gateway endpoints only');
  assert.ok(!calls.some(call=>call.url.includes('openai.com')||call.url.includes('openrouter.ai')),'no direct provider API may be called');

  const source=readFileSync('netlify/functions/_shared/models.mjs','utf8');
  const speech=readFileSync('netlify/functions/speech.mjs','utf8');
  for(const forbidden of ['OPENROUTER_DIRECT_API_KEY','OPENAI_DIRECT_API_KEY','https://api.openai.com','https://openrouter.ai/api/v1','https://generativelanguage.googleapis.com'])
    assert.ok(!source.includes(forbidden)&&!speech.includes(forbidden),'a direct AI provider route remains');
  const chat=readFileSync('netlify/functions/chat.mjs','utf8');
  assert.ok(chat.includes("levelDecision.level='IMAGE_GENERATION'"));
  assert.ok(chat.includes("webIntent&&!toolWorkflow?'SIMPLE':gearLevel"));
  assert.ok(chat.includes('GEAR_CALL_CAPS.ZEUS_DIRECTED+1'));
  assert.ok(chat.includes('runOlympusCompoundPlus(')&&chat.includes('runOlympus('));

  console.log('Gateway-only calls, same-work fan-out, and distinct L2/L3/Olympus model families: PASS');
}finally{globalThis.fetch=previousFetch;globalThis.Netlify=previousNetlify;}
