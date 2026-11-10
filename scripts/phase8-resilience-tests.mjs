import assert from 'node:assert/strict';
import {buildTransportRoutes} from '../netlify/functions/_shared/provider-routing.mjs';
import {createExecutionBudget} from '../netlify/functions/_shared/runtime.mjs';
import {snapshotProviderTelemetry} from '../netlify/functions/_shared/provider-observability.mjs';
import * as models from '../netlify/functions/_shared/models.mjs';

const prev=globalThis.Netlify;
const env={OPENAI_DIRECT_API_KEY:'direct-openai',OPENROUTER_DIRECT_API_KEY:'must-not-route'};
try{
  globalThis.Netlify={env:{get:key=>env[key]||''}};
  assert.deepEqual(models.providerTransportStatus(),{gateway:{openai:false,anthropic:false,gemini:false,openrouter:false}});
  const budget=createExecutionBudget({maxCalls:4,timeoutMs:30000});
  assert.equal(snapshotProviderTelemetry(budget).modelCalls,0);
  const candidates=[
    {provider:'anthropic',id:'claude',transport:'gateway'},
    {provider:'openrouter',id:'x-ai/grok',transport:'gateway'},
    {provider:'openai',id:'gpt-6-luna',transport:'openai_direct'}
  ];
  assert.deepEqual(buildTransportRoutes(candidates,{limit:4,gatewayEnabled:()=>false,directEnabled:(m,t)=>t==='openai_direct'&&Boolean(env.OPENAI_DIRECT_API_KEY)}).map(x=>x.transport),['openai_direct'],
    'a direct OpenAI key may recover after Gateway routes are unavailable');
  assert.deepEqual(buildTransportRoutes([
    {provider:'openrouter',id:'x-ai/grok',transport:'openrouter_direct'}
  ],{limit:4,gatewayEnabled:()=>true,directEnabled:()=>true}),[],
    'OpenRouter personal direct credentials are never a transport');
  assert.deepEqual(buildTransportRoutes([
    {provider:'openai',id:'gpt-5',transport:'gateway'},{provider:'gemini',id:'gemini-3.5-flash',transport:'gemini_direct'}
  ],{limit:4,gatewayEnabled:()=>true,directEnabled:(m,t)=>t==='gemini_direct'}).map(x=>x.transport),['gateway','gemini_direct']);
}finally{globalThis.Netlify=prev;models.__resetProviderHealthForTests();}
console.log('Gateway recovery with explicit Google/OpenAI direct fallback only: PASS');
