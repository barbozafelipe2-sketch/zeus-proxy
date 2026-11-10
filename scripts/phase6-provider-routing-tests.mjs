import assert from 'node:assert/strict';
import {modelFamily,modelCircuitScope,modelRouteIdentity,buildTransportRoutes} from '../netlify/functions/_shared/provider-routing.mjs';
import {createExecutionBudget} from '../netlify/functions/_shared/runtime.mjs';
import * as models from '../netlify/functions/_shared/models.mjs';

assert.equal(modelFamily({provider:'openrouter',id:'anthropic/claude-sonnet-4.5'}),'anthropic');
assert.equal(modelFamily({provider:'openrouter',id:'google/gemini-2.5-flash'}),'gemini');
assert.equal(modelFamily({provider:'openrouter',id:'x-ai/grok-4.5'}),'xai');
assert.equal(modelCircuitScope({provider:'openrouter'}),'openrouter');
assert.equal(modelCircuitScope({provider:'openai',transport:'openai_direct'}),'openai_openai_direct');
assert.equal(modelRouteIdentity({provider:'openai',id:'gpt-5',transport:'openai_direct'}),'openai_direct:openai:gpt-5');

const ranked=[{provider:'anthropic',id:'claude'},{provider:'openrouter',id:'x-ai/grok'},{provider:'gemini',id:'gemini',transport:'gemini_direct'},{provider:'openai',id:'gpt',transport:'openai_direct'}];
assert.deepEqual(buildTransportRoutes(ranked,{limit:4,gatewayEnabled:m=>m.provider!=='gemini',directEnabled:()=>true}).map(x=>x.transport),['gateway','gateway','gemini_direct','openai_direct']);
assert.deepEqual(buildTransportRoutes(ranked,{limit:4,gatewayEnabled:()=>false,directEnabled:()=>true}).map(x=>x.transport),['gemini_direct','openai_direct']);

const oldNetlify=globalThis.Netlify,oldFetch=globalThis.fetch;
const env={OPENROUTER_DIRECT_API_KEY:'must-not-route',OPENAI_API_KEY:'gateway-token-only'};
let calls=[];
try{
  globalThis.Netlify={env:{get:key=>env[key]||''}};
  globalThis.fetch=async(url)=>{calls.push(String(url));return new Response('{}',{status:200});};
  assert.deepEqual(models.providerTransportStatus(),{gateway:{openai:false,anthropic:false,gemini:false,openrouter:false},openai_direct:false,gemini_direct:false});
  assert.equal(models.availableModels().length,0);
  await assert.rejects(models.callModel({provider:'openai',id:'gpt-5',transport:'openai_direct'},'s','u',{
    budget:createExecutionBudget({timeoutMs:10000,maxCalls:1})
  }),/not configured/i);
  assert.equal(calls.length,0,'an injected Gateway key without its Gateway base cannot trigger a direct request');

  Object.assign(env,{
    ANTHROPIC_API_KEY:'gateway-anthropic',ANTHROPIC_BASE_URL:'https://gateway-anthropic.test',
    OPENROUTER_API_KEY:'gateway-router',OPENROUTER_BASE_URL:'https://gateway-router.test/v1',
    GEMINI_DIRECT_API_KEY:'direct-google',OPENAI_DIRECT_API_KEY:'direct-openai'
  });
  const writing=models.rankModels('write a brief',new Set(),{routeHint:'writing'});
  assert.ok(writing.some(model=>model.provider==='gemini'&&model.id==='gemini-3.1-pro-preview'&&model.transport==='gemini_direct'),'writing fallback keeps premium capability on direct Gemini');
  assert.ok(writing.some(model=>model.provider==='openai'&&model.id==='gpt-6.1-sol'&&model.transport==='openai_direct'),'writing fallback escalates to strong direct OpenAI');
  const fast=models.rankModels('hello',new Set(),{routeHint:'fast'});
  assert.ok(fast.some(model=>model.provider==='openai'&&model.id==='gpt-6-luna'&&model.transport==='openai_direct'),'simple turns use the economical direct OpenAI tier');
  const hard=models.rankModels('audit a production architecture',new Set(),{routeHint:'hard'});
  assert.ok(hard.some(model=>model.provider==='gemini'&&model.id==='gemini-3.1-pro-preview'&&model.transport==='gemini_direct'),'hard requests retain premium reasoning on direct Gemini');
  assert.ok(hard.some(model=>model.provider==='openai'&&model.id==='gpt-6-astra'&&model.transport==='openai_direct'&&model.tier==='flagship'),'only the hard tier can use the highest-capability direct OpenAI model');
  calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push(String(url));
    if(String(url).startsWith('https://gateway-anthropic.test'))return new Response(JSON.stringify({error:{message:'upstream unavailable'}}),{status:503});
    if(String(url).startsWith('https://gateway-router.test'))return new Response(JSON.stringify({error:{message:'upstream unavailable'}}),{status:503});
    if(String(url).startsWith('https://generativelanguage.googleapis.com'))return new Response(JSON.stringify({error:{message:'temporarily unavailable'}}),{status:503});
    assert.equal(String(url),'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization,'Bearer direct-openai');
    return new Response(JSON.stringify({choices:[{message:{content:'Recovered through direct OpenAI fallback'}}]}),{status:200});
  };
  const reply=await models.executeWithFallback('write a short note','system','user request',{
    routeHint:'writing',maxAttempts:5,budget:createExecutionBudget({timeoutMs:30000,maxCalls:5})
  });
  assert.equal(reply.content,'Recovered through direct OpenAI fallback');
  assert.equal(reply.model.transport,'openai_direct');
  assert.deepEqual(calls.slice(0,4),[
    'https://gateway-anthropic.test/v1/messages',
    'https://gateway-router.test/v1/chat/completions',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent',
    'https://api.openai.com/v1/chat/completions'
  ]);
  assert.equal(models.providerTransportStatus().gateway.openrouter,true,'OpenRouter is reported only as a Gateway route');
}finally{globalThis.Netlify=oldNetlify;globalThis.fetch=oldFetch;models.__resetProviderHealthForTests();}
console.log('Gateway-first, OpenRouter-Gateway second, explicit Google/OpenAI direct fallbacks: PASS');
