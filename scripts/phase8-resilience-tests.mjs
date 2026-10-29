import assert from 'node:assert/strict';
import {buildTransportRoutes} from '../netlify/functions/_shared/provider-routing.mjs';
import {createExecutionBudget} from '../netlify/functions/_shared/runtime.mjs';
import {snapshotProviderTelemetry} from '../netlify/functions/_shared/provider-observability.mjs';
import * as models from '../netlify/functions/_shared/models.mjs';

const prev=globalThis.Netlify;
const env={OPENAI_DIRECT_API_KEY:'direct-openai',OPENROUTER_DIRECT_API_KEY:'direct-openrouter'};
try{
  globalThis.Netlify={env:{get:key=>env[key]||''}};
  assert.deepEqual(models.providerTransportStatus(),{gateway:{openai:false,anthropic:false,gemini:false,openrouter:false}});
  const budget=createExecutionBudget({maxCalls:4,timeoutMs:30000});
  assert.equal(snapshotProviderTelemetry(budget).modelCalls,0);
  const routes=buildTransportRoutes([
    {provider:'openai',id:'gpt-5'},
    {provider:'openrouter',id:'x-ai/grok-4.5'}
  ],{limit:4,gatewayEnabled:()=>false,openrouterDirect:true,openaiDirect:true});
  assert.deepEqual(routes,[],'direct credentials cannot recover a disabled Gateway');
  assert.deepEqual(buildTransportRoutes([
    {provider:'openai',id:'gpt-5'},{provider:'gemini',id:'gemini-3.5-flash'}
  ],{limit:4,gatewayEnabled:()=>true,openrouterDirect:true,openaiDirect:true}).map(x=>x.transport),['gateway','gateway']);
}finally{globalThis.Netlify=prev;models.__resetProviderHealthForTests();}
console.log('Gateway-only recovery behavior: PASS');
