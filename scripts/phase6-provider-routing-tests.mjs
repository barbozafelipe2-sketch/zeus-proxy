import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modelFamily, modelCircuitScope, modelRouteIdentity, buildTransportRoutes } from '../netlify/functions/_shared/provider-routing.mjs';

const models=[
  {provider:'gemini',id:'gemini-3.5-flash',roles:['fast']},
  {provider:'anthropic',id:'claude-sonnet-5',roles:['critic']},
  {provider:'openai',id:'gpt-5',roles:['director']}
];
assert.equal(modelFamily({provider:'openrouter',id:'anthropic/claude-sonnet-4.5'}),'anthropic');
assert.equal(modelFamily({provider:'openrouter',id:'google/gemini-2.5-flash'}),'gemini');
assert.equal(modelFamily({provider:'openrouter',id:'x-ai/grok-4.5'}),'xai');
assert.equal(modelCircuitScope({provider:'openrouter',transport:'openrouter_direct'}),'openrouter_direct');
assert.notEqual(modelRouteIdentity({provider:'openai',id:'gpt-5'}),modelRouteIdentity({provider:'openai',id:'gpt-5',transport:'openai_direct'}));

const zero=buildTransportRoutes(models,{limit:3,gatewayEnabled:()=>true});
assert.deepEqual(zero.map(m=>m.transport),['gateway','gateway','gateway']);
const all=buildTransportRoutes(models,{limit:4,gatewayEnabled:()=>true,openrouterDirect:true,openaiDirect:true});
assert.deepEqual(all.map(m=>m.transport),['gateway','gateway','openrouter_direct','openai_direct']);
assert.equal(all[2].provider,'openrouter');
assert.ok(all[2].id.includes('/'));
const down=buildTransportRoutes(models,{limit:3,gatewayEnabled:()=>false,openrouterDirect:true,openaiDirect:true});
assert.equal(down[0].transport,'openrouter_direct');
assert.equal(down[1].transport,'openai_direct');
const strict=buildTransportRoutes(models.filter(m=>m.provider!=='openai'),{limit:3,gatewayEnabled:()=>false,openrouterDirect:true,openaiDirect:true});
assert.ok(strict.every(m=>modelFamily(m)!=='openai'),'critic/director exclusion must survive direct fallback');
assert.ok(all.length<=4&&down.length<=3,'route plan must respect the attempt cap');

const source=readFileSync('netlify/functions/_shared/models.mjs','utf8');
for(const token of ['buildTransportRoutes','OPENROUTER_DIRECT_API_KEY','OPENAI_DIRECT_API_KEY','modelCircuitScope(model)','modelFamily(director.model)']){
  assert.ok(source.includes(token),'Stage 6 integration is missing: '+token);
}
// Synthetic adapter failures prove that a Gateway credential error cannot poison separate direct credentials.
const { createExecutionBudget } = await import('../netlify/functions/_shared/runtime.mjs');
const ai=await import('../netlify/functions/_shared/models.mjs');
const oldFetch=globalThis.fetch,oldNetlify=globalThis.Netlify;
const credentials={
  OPENAI_API_KEY:'synthetic-gateway-openai',OPENAI_BASE_URL:'https://gateway.fixture/v1',
  GEMINI_API_KEY:'synthetic-gateway-google',GOOGLE_GEMINI_BASE_URL:'https://gateway.fixture',
  OPENROUTER_DIRECT_API_KEY:'synthetic-direct-router',OPENAI_DIRECT_API_KEY:'synthetic-direct-openai'
};
const recorded=[];
try{
  globalThis.Netlify={env:{get:name=>credentials[name]||''}};
  globalThis.fetch=async (url,options)=>{
    const channel=url.includes('gateway.fixture')?'gateway':url.includes('openrouter.ai')?'openrouter_direct':'openai_direct';
    recorded.push(channel);
    if(channel==='openai_direct')return {ok:true,status:200,json:async()=>({choices:[{message:{content:'break-glass success'}}]})};
    return {ok:false,status:401,json:async()=>({error:{message:'Synthetic auth failure'}})};
  };
  ai.__resetProviderHealthForTests();
  const budget=createExecutionBudget({timeoutMs:30000,maxCalls:4});
  const reply=await ai.executeWithFallback('Hello','system','Hello',{budget,maxAttempts:4});
  assert.equal(reply.content,'break-glass success');
  assert.deepEqual(recorded,['gateway','openrouter_direct','openai_direct']);
  assert.equal(reply.attempts.length,2);
  assert.equal(reply.attempts[1].transport,'openrouter_direct');
}finally{
  globalThis.fetch=oldFetch;globalThis.Netlify=oldNetlify;ai.__resetProviderHealthForTests();
}
console.log('Zeus 6/10 independent transport/family routing tests: PASS');
