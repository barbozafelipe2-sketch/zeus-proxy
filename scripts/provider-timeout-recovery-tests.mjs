import assert from 'node:assert/strict';
import {callModel,rankModels,summarizeProviderFailure,__resetProviderHealthForTests} from '../netlify/functions/_shared/models.mjs';
import {createExecutionBudget} from '../netlify/functions/_shared/runtime.mjs';
import {translateInterfaceText} from '../public/locale-pt.js';
const savedFetch=globalThis.fetch,savedNetlify=globalThis.Netlify;
let outbound=0;
try{
  globalThis.Netlify={env:{get:key=>({OPENROUTER_API_KEY:'test-gateway',OPENROUTER_BASE_URL:'https://gateway.test/v1'})[key]||''}};
  __resetProviderHealthForTests();
  const model={provider:'openrouter',id:'x-ai/grok-4.3'};
  globalThis.fetch=async()=>{outbound++;throw new DOMException('Timed out','TimeoutError');};
  for(let n=0;n<2;n++)await assert.rejects(callModel(model,'system','hello'),{name:'TimeoutError'});
  await assert.rejects(callModel(model,'system','hello'),{code:'PROVIDER_CIRCUIT_OPEN'});
  assert.equal(outbound,2,'model circuit prevents a third paid request');
  globalThis.fetch=async()=>{outbound++;return Response.json({choices:[{message:{content:'Hello'}}]});};
  assert.equal(await callModel({provider:'openrouter',id:'deepseek/deepseek-v4.1-flash'},'system','hello'),'Hello','another model on the same Gateway remains available');
  const budget=createExecutionBudget({maxCalls:0});
  await assert.rejects(callModel({provider:'openrouter',id:'budget-test'},'s','u',{budget}),{code:'EXECUTION_BUDGET_EXHAUSTED'});
  assert.equal(outbound,3,'budget guards do not issue requests');
  __resetProviderHealthForTests();
  const fast=rankModels('Oi').filter(m=>m.provider==='openrouter');
  assert.equal(fast[0].id,'deepseek/deepseek-v4.1-flash','measured fast model precedes slower reasoning model for casual chat');
  const summary=summarizeProviderFailure([{provider:'openrouter',model:'x-ai/grok-4.3',code:'PROVIDER_TIMEOUT',error:'timeout'},{provider:'openrouter',model:'deepseek/deepseek-v4.1-flash',status:502,error:'bad gateway'}]);
  assert.equal(summary.code,'AI_PROVIDERS_FAILED');
  assert.ok(summary.message.includes('grok-4.3: timeout; deepseek/deepseek-v4.1-flash: 502'));
  assert.ok(translateInterfaceText('No configured AI provider completed this request. (grok: timeout) · ref example').includes('Nenhum serviço de IA'));
}finally{globalThis.fetch=savedFetch;globalThis.Netlify=savedNetlify;__resetProviderHealthForTests();}
console.log('Model timeout isolation, budget guard, fast fallback and diagnostic translation: PASS');
