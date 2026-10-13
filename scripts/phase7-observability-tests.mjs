import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExecutionBudget } from '../netlify/functions/_shared/runtime.mjs';
import { failureCategory,recordProviderAttempt,snapshotProviderTelemetry,summarizeTransportEvidence } from '../netlify/functions/_shared/provider-observability.mjs';
import * as ai from '../netlify/functions/_shared/models.mjs';

const source=readFileSync('netlify/functions/chat.mjs','utf8');
assert.ok(source.includes('providerTelemetry:snapshotProviderTelemetry(executionBudget)'),'successful and failed requests must persist telemetry');
assert.ok(source.includes('item.transport===\'gateway\''),'Gateway and direct blocks must be isolated');
assert.equal(failureCategory({status:401,message:'secret-untrusted'}),'auth');
assert.equal(failureCategory({status:429}),'rate_limit');
assert.equal(failureCategory({name:'TimeoutError'}),'timeout');

const oldFetch=globalThis.fetch,oldNetlify=globalThis.Netlify,oldNow=Date.now;
const conf={
  GEMINI_API_KEY:'synthetic-gateway-credential',GOOGLE_GEMINI_BASE_URL:'https://gateway.fixture',
  OPENAI_API_KEY:'synthetic-gateway-credential',OPENAI_BASE_URL:'https://gateway.fixture/v1',
  OPENROUTER_DIRECT_API_KEY:'synthetic-router-credential',OPENAI_DIRECT_API_KEY:'synthetic-openai-credential'
};
const routes=[];
try{
  globalThis.Netlify={env:{get:key=>conf[key]||''}};
  globalThis.fetch=async (url,init)=>{
    const transport=url.includes('gateway.fixture')?'gateway':url.includes('openrouter.ai')?'openrouter_direct':'openai_direct';
    routes.push({transport,auth:init.headers.Authorization||init.headers['x-goog-api-key']||''});
    if(transport==='openai_direct')return {ok:true,status:200,json:async()=>({choices:[{message:{content:'RECOVERED'}}]})};
    return {ok:false,status:transport==='gateway'?503:429,json:async()=>({error:{message:'Synthetic upstream rejected request SECRET_NEVER_IN_TRACE'}})};
  };
  ai.__resetProviderHealthForTests();
  const budget=createExecutionBudget({timeoutMs:40000,maxCalls:4});
  const answer=await ai.executeWithFallback('Hello','sys','Hello',{maxAttempts:4,budget});
  assert.equal(answer.content,'RECOVERED');
  assert.deepEqual(routes.map(r=>r.transport),['gateway','gateway','openrouter_direct','openai_direct']);
  const telemetry=snapshotProviderTelemetry(budget);
  assert.equal(telemetry.modelCalls,4);
  assert.equal(telemetry.budgetCalls,4);
  assert.equal(telemetry.succeeded,1);
  assert.equal(telemetry.failed,3);
  assert.equal(telemetry.recovered,true);
  assert.equal(telemetry.independentFallbackUsed,true);
  assert.equal(telemetry.attempts[2].failureClass,'rate_limit');
  assert.equal(telemetry.attempts[3].transport,'openai_direct');
  assert.equal(telemetry.attempts[3].family,'openai');
  assert.ok(!JSON.stringify(telemetry).includes('SECRET_NEVER_IN_TRACE'),'never persist upstream errors or secrets');

  const sample=[{observed_at:new Date().toISOString(),state:'COMPLETED',trace:{providerTelemetry:telemetry}}];
  const health=summarizeTransportEvidence(sample,{gateway:true,openrouter_direct:true,openai_direct:true},{});
  assert.equal(health.gateway.failures,2);
  assert.equal(health.gateway.status,'recent_failure');
  assert.equal(health.openrouter_direct.failures,1);
  assert.equal(health.openai_direct.successes,1);
  assert.equal(health.openai_direct.status,'observed_healthy');
  assert.equal(health.openai_direct.recoveredExecutions,1);

  // Runtime breaker is per transport; the direct Router can pause while the Gateway remains usable.
  ai.__resetProviderHealthForTests();
  ai.__recordProviderFailureForTests('openrouter_direct');
  ai.__recordProviderFailureForTests('openrouter_direct');
  assert.equal(ai.providerRuntimeHealth().openrouter_direct.circuitOpen,true);
  assert.equal(ai.providerRuntimeHealth().openai_direct.circuitOpen,false);
  assert.equal(ai.providerRuntimeHealth().gemini.circuitOpen,false);
  Date.now=()=>oldNow()+190000; // synthetic cooldown, no sleep or API usage
  assert.equal(ai.providerRuntimeHealth().openrouter_direct.circuitOpen,false,'cooldown should recover route');
  Date.now=oldNow;

  const standalone={snapshot(){return {calls:1}}};
  recordProviderAttempt(standalone,{model:{id:'anthropic/claude-sonnet-4.5',provider:'openrouter',transport:'openrouter_direct'},stage:'olympus_critic',error:{status:403,message:'RAW SECRET'},durationMs:25});
  const log=snapshotProviderTelemetry(standalone);
  assert.equal(log.attempts[0].family,'anthropic');
  assert.equal(log.attempts[0].failureClass,'auth');
  assert.ok(!JSON.stringify(log).includes('RAW SECRET'));
}finally{
  Date.now=oldNow;globalThis.fetch=oldFetch;globalThis.Netlify=oldNetlify;ai.__resetProviderHealthForTests();
}
console.log('Zeus 7/10 observability, privacy, fallback and recovery tests: PASS');
