import assert from 'node:assert/strict';
import {modelFamily,modelCircuitScope,modelRouteIdentity,buildTransportRoutes} from '../netlify/functions/_shared/provider-routing.mjs';
import {createExecutionBudget} from '../netlify/functions/_shared/runtime.mjs';
import * as models from '../netlify/functions/_shared/models.mjs';

assert.equal(modelFamily({provider:'openrouter',id:'anthropic/claude-sonnet-4.5'}),'anthropic');
assert.equal(modelFamily({provider:'openrouter',id:'google/gemini-2.5-flash'}),'gemini');
assert.equal(modelFamily({provider:'openrouter',id:'x-ai/grok-4.5'}),'xai');
assert.equal(modelCircuitScope({provider:'openrouter',transport:'openrouter_direct'}),'openrouter');
assert.equal(modelRouteIdentity({provider:'openai',id:'gpt-5',transport:'openai_direct'}),'gateway:openai:gpt-5');

const ranked=[{provider:'openai',id:'a'},{provider:'anthropic',id:'b'},{provider:'gemini',id:'c'}];
assert.deepEqual(buildTransportRoutes(ranked,{limit:3,gatewayEnabled:()=>true,openrouterDirect:true,openaiDirect:true}).map(x=>x.transport),['gateway','gateway','gateway']);
assert.deepEqual(buildTransportRoutes(ranked,{limit:3,gatewayEnabled:m=>m.provider!=='anthropic'}).map(x=>x.provider),['openai','gemini']);

const oldNetlify=globalThis.Netlify,oldFetch=globalThis.fetch;
const env={OPENROUTER_DIRECT_API_KEY:'should-never-route',OPENAI_DIRECT_API_KEY:'should-never-route'};
let calls=[];
try{
  globalThis.Netlify={env:{get:key=>env[key]||''}};
  globalThis.fetch=async(url)=>{calls.push(String(url));return new Response('{}',{status:200});};
  assert.deepEqual(models.providerTransportStatus(),{gateway:{openai:false,anthropic:false,gemini:false,openrouter:false}});
  assert.equal(models.availableModels().length,0);
  await assert.rejects(models.callModel({provider:'openai',id:'gpt-5',transport:'openai_direct'},'s','u',{
    budget:createExecutionBudget({timeoutMs:10000,maxCalls:1})
  }),/not configured/i);
  assert.equal(calls.length,0,'a standalone API key cannot trigger a direct provider call');

  Object.assign(env,{OPENAI_API_KEY:'gateway-token',OPENAI_BASE_URL:'https://gateway.fixture/v1'});
  globalThis.fetch=async(url,options)=>{calls.push(String(url));assert.equal(options.headers.Authorization,'Bearer gateway-token');return new Response(JSON.stringify({choices:[{message:{content:'OK'}}]}),{status:200});};
  const reply=await models.callModel({provider:'openai',id:'gpt-5',transport:'openai_direct'},'s','u',{
    budget:createExecutionBudget({timeoutMs:10000,maxCalls:1})
  });
  assert.equal(reply,'OK');
  assert.equal(calls.at(-1),'https://gateway.fixture/v1/chat/completions');
}finally{globalThis.Netlify=oldNetlify;globalThis.fetch=oldFetch;models.__resetProviderHealthForTests();}
console.log('Gateway-only provider routes and blocked standalone credentials: PASS');
