import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExecutionBudget } from '../netlify/functions/_shared/runtime.mjs';
import * as ai from '../netlify/functions/_shared/models.mjs';
import { snapshotProviderTelemetry } from '../netlify/functions/_shared/provider-observability.mjs';

const oldNetlify=globalThis.Netlify,oldFetch=globalThis.fetch;
const env={
  GEMINI_API_KEY:'fixture-gateway',GOOGLE_GEMINI_BASE_URL:'https://gateway.fixture',
  OPENAI_API_KEY:'fixture-gateway',OPENAI_BASE_URL:'https://gateway.fixture/v1',
  OPENROUTER_DIRECT_API_KEY:'fixture-direct-router',OPENAI_DIRECT_API_KEY:'fixture-direct-openai'
};
const seen=[];
async function run(statuses,expected){
  seen.length=0;ai.__resetProviderHealthForTests();
  globalThis.fetch=async(url)=>{
    const route=url.includes('gateway.fixture')?'gateway':url.includes('openrouter.ai')?'openrouter_direct':'openai_direct';
    const status=statuses[seen.length]??503;
    seen.push({route,status});
    return {ok:status===200,status,json:async()=>status===200
      ?(url.includes(':generateContent')?{candidates:[{content:{parts:[{text:'FIXTURE_OK'}]}}]}:{choices:[{message:{content:'FIXTURE_OK'}}]})
      :{error:{message:status===413?'Payload too large':status===400?'Invalid request body':status===404?'Model not found':status===422?'Malformed request':'Temporary provider failure'}}};
  };
  const budget=createExecutionBudget({timeoutMs:30000,maxCalls:4});
  let answer=null,error=null;
  try{answer=await ai.executeWithFallback('Hello','system','Hello',{budget,maxAttempts:4});}
  catch(ex){error=ex;}
  const telemetry=snapshotProviderTelemetry(budget);
  assert.equal(seen.length,expected.calls,'unexpected outbound model call count');
  assert.equal(telemetry.budgetCalls,seen.length,'every outbound attempt must be budgeted');
  assert.equal(telemetry.modelCalls,seen.length,'every provider attempt needs observability');
  if(expected.error){
    assert.equal(error?.code,expected.error);
    assert.equal(answer,null);
  }else{
    assert.equal(error,null);
    assert.equal(answer?.content,'FIXTURE_OK');
  }
  if(expected.routes)assert.deepEqual(seen.map(x=>x.route),expected.routes);
  assert.ok(!JSON.stringify(telemetry).includes('fixture-gateway'));
  return {answer,error,telemetry};
}
try{
  globalThis.Netlify={env:{get:key=>env[key]||''}};
  await run([200],{calls:1,routes:['gateway']});
  await run([413,200],{calls:1,error:'AI_REQUEST_REJECTED'});
  await run([422,200],{calls:1,error:'AI_REQUEST_REJECTED'});
  await run([400,200],{calls:1,error:'AI_REQUEST_REJECTED'});
  await run([404,200],{calls:2,routes:['gateway','gateway']});
  await run([429,200],{calls:2,routes:['gateway','gateway']});
  await run([503,503,200],{calls:3,routes:['gateway','gateway','openrouter_direct']});
  await run([503,503,503,200],{calls:4,routes:['gateway','gateway','openrouter_direct','openai_direct']});
  await run([503,503,503,503],{calls:4,error:'AI_PROVIDERS_FAILED'});
  const source=readFileSync('netlify/functions/chat.mjs','utf8');
  assert.ok(source.includes("if(olympusError?.code==='AI_REQUEST_REJECTED')throw olympusError"),
    'Olympus must not relaunch Zeus on globally invalid payloads');
  const models=readFileSync('netlify/functions/_shared/models.mjs','utf8');
  assert.ok(models.includes("if(entry.reason?.code==='AI_REQUEST_REJECTED')throw entry.reason"),
    'Turbo creators must not downgrade into additional paid model calls after a globally invalid request');
  assert.ok(models.includes('maxCalls:10')&&models.includes('maxCreators:3'));
}finally{
  globalThis.fetch=oldFetch;globalThis.Netlify=oldNetlify;ai.__resetProviderHealthForTests();
}
console.log('Zeus 8/10 resiliency and no-waste recovery tests: PASS');
