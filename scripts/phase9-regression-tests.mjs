import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modelFamily,modelCircuitScope,modelRouteIdentity,buildTransportRoutes } from '../netlify/functions/_shared/provider-routing.mjs';
import { createExecutionBudget } from '../netlify/functions/_shared/runtime.mjs';
import { snapshotProviderTelemetry } from '../netlify/functions/_shared/provider-observability.mjs';
import * as ai from '../netlify/functions/_shared/models.mjs';

const source=readFileSync('netlify/functions/_shared/models.mjs','utf8');
const chat=readFileSync('netlify/functions/chat.mjs','utf8');
const policy=readFileSync('netlify/functions/_shared/execution-policy.mjs','utf8');
const ui=readFileSync('public/app.js','utf8');

assert.ok(
  source.includes('const previousFamilies=[...new Set([...creatorProviders,modelFamily(director.model)])]') &&
  source.includes('let ceoCandidates=ceoOrder(previousFamilies)') &&
  source.includes('excludedProviders.has(modelFamily(m))'),
  'The CEO must exclude director MODEL FAMILY using the shared family-aware candidate filter, including OpenRouter'
);
assert.ok(source.includes("gptFinished:modelFamily(final.model)==='openai'"),
  'Do not claim a non-GPT fallback was finished by GPT');
assert.ok(source.includes("pipelineLabel:webResearchUsed?'Compound Plus · live web research")&&source.includes("modelFamily(final.model)==='openai'"),
  'User-facing pipeline label must describe the model that actually finished');
assert.ok(source.includes("if(isNonRetryableRequestFailure(error))throw rejectedRequestError(error,attempts)"));
assert.ok(chat.includes("if(olympusError?.code==='AI_REQUEST_REJECTED')throw olympusError"));
assert.ok(chat.includes('const providerTelemetry=snapshotProviderTelemetry(executionBudget)')&&chat.includes('usage:failedUsage'),'successful and failed runs must persist telemetry');
assert.ok(chat.includes('const safeAttempts=')&&chat.includes('publicFailure=publicExecutionFailure(error)'), 'safe diagnostic behavior must be present');
assert.ok(policy.includes('turboApprovalFingerprint')&&policy.includes('estimateTurboQuote'));
assert.ok(policy.includes('externalMutationPolicy'));
assert.ok(ui.includes('turboApprovalModal')&&ui.includes('approvalFingerprint'));
assert.ok(ui.includes('lastFailedRequestId'));
assert.equal(ai.TURBO_LIMITS.maxCreators,2);
assert.equal(ai.TURBO_LIMITS.maxCalls,4);
assert.equal(ai.TURBO_LIMITS.timeoutMs,150000);

const candidates=[
  {provider:'gemini',id:'g1',roles:['reasoning']},
  {provider:'anthropic',id:'a1',roles:['critic']},
  {provider:'openai',id:'o1',roles:['director']}
];
for(const cap of [1,2,3,4,5]){
  for(const gateway of [true,false]){
    for(const router of [true,false]){
      for(const direct of [true,false]){
        const routes=buildTransportRoutes(candidates,{
          limit:cap,gatewayEnabled:()=>gateway,openrouterDirect:router,openaiDirect:direct
        });
        assert.ok(routes.length<=cap,'route count must respect hard cap');
        assert.equal(new Set(routes.map(modelRouteIdentity)).size,routes.length,'no repeated paid route');
        if(gateway)assert.equal(routes[0]?.transport,'gateway','gateway must remain primary');
        if(!gateway)assert.ok(routes.every(r=>r.transport!=='gateway'),'disabled gateway must not be queried');
        if(!router)assert.ok(!routes.some(r=>r.transport==='openrouter_direct'));
        if(!direct)assert.ok(!routes.some(r=>r.transport==='openai_direct'));
      }
    }
  }
}
assert.equal(modelFamily({provider:'openrouter',id:'anthropic/claude-sonnet-4.5',transport:'openrouter_direct'}),'anthropic');
assert.equal(modelCircuitScope({provider:'openrouter',transport:'openrouter_direct'}),'openrouter_direct');
assert.equal(modelCircuitScope({provider:'openrouter',transport:'gateway'}),'openrouter');

const originalNetlify=globalThis.Netlify,originalFetch=globalThis.fetch;
try{
  const env={
    GEMINI_API_KEY:'synthetic-gateway',GOOGLE_GEMINI_BASE_URL:'https://gateway.fixture',
    OPENAI_API_KEY:'synthetic-gateway',OPENAI_BASE_URL:'https://gateway.fixture/v1',
    OPENROUTER_DIRECT_API_KEY:'synthetic-router',OPENAI_DIRECT_API_KEY:'synthetic-openai'
  };
  globalThis.Netlify={env:{get:key=>env[key]||''}};
  ai.__resetProviderHealthForTests();
  const ceo=ai.roleCandidates('CEO','review', {excludeProviders:['gemini'],limit:4});
  assert.ok(ceo.length>0);
  assert.ok(ceo.every(m=>modelFamily(m)!=='gemini'),'family exclusion cannot be bypassed by provider alias');
  let calls=0;
  globalThis.fetch=async(url)=>{
    calls++;
    const status=url.includes('gateway.fixture')?503:url.includes('openrouter.ai')?503:200;
    return {ok:status===200,status,json:async()=>status===200
      ?{choices:[{message:{content:'FALLBACK_OK'}}]}
      :{error:{message:'Mocked upstream failure'}}};
  };
  const budget=createExecutionBudget({maxCalls:4,timeoutMs:40000,reserveMs:0});
  const result=await ai.executeWithFallback('Hello','system','Hello',{budget,maxAttempts:4});
  assert.equal(result.content,'FALLBACK_OK');
  assert.equal(calls,4);
  assert.equal(snapshotProviderTelemetry(budget).modelCalls,calls);
  assert.equal(snapshotProviderTelemetry(budget).independentFallbackUsed,true);
}finally{
  globalThis.Netlify=originalNetlify;globalThis.fetch=originalFetch;ai.__resetProviderHealthForTests();
}
console.log('Zeus 9/10 critical regression and role-family audit: PASS');
