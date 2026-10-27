import assert from 'node:assert/strict';
import {createExecutionBudget} from '../netlify/functions/_shared/runtime.mjs';

const previousFetch=globalThis.fetch,previousNetlify=globalThis.Netlify;
const vars={
  OPENAI_API_KEY:'gateway-openai-token',OPENAI_BASE_URL:'https://gateway-openai.test/v1',
  ANTHROPIC_API_KEY:'gateway-anthropic-token',ANTHROPIC_BASE_URL:'https://gateway-anthropic.test',
  GEMINI_API_KEY:'gateway-gemini-token',GOOGLE_GEMINI_BASE_URL:'https://gateway-gemini.test',
  OPENROUTER_API_KEY:'gateway-router-token',OPENROUTER_BASE_URL:'https://gateway-router.test/v1',
};
globalThis.Netlify={env:{get:key=>vars[key]||''}};
const calls=[];
globalThis.fetch=async(url,options={})=>{
  calls.push({url:String(url),authorization:options.headers?.Authorization||'',body:JSON.parse(String(options.body||'{}'))});
  const target=String(url);
  if(target.includes('anthropic'))return new Response(JSON.stringify({content:[{type:'text',text:'DRAFT'}]}),{status:200});
  if(target.includes('gemini'))return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'DRAFT'}]}}]}),{status:200});
  return new Response(JSON.stringify({choices:[{message:{content:'DRAFT'}}]}),{status:200});
};

try{
  const models=await import(`../netlify/functions/_shared/models.mjs?gateway-levels=${Date.now()}`);
  models.__resetProviderHealthForTests();

  await models.callModel({provider:'openrouter',id:'x-ai/grok-4.5'},'system','gateway check',{
    budget:createExecutionBudget({timeoutMs:30000,maxCalls:1})
  });
  assert.equal(calls.at(-1).url,'https://gateway-router.test/v1/chat/completions');
  assert.equal(calls.at(-1).authorization,'Bearer gateway-router-token');

  // A stray provider key cannot silently turn the normal route into a direct call.
  vars.OPENROUTER_API_KEY='stray-user-key';delete vars.OPENROUTER_BASE_URL;
  vars.NETLIFY_AI_GATEWAY_KEY='generic-gateway-token';vars.NETLIFY_AI_GATEWAY_URL='https://generic-gateway.test/v1';
  await models.callModel({provider:'openrouter',id:'x-ai/grok-4.5'},'system','gateway check',{
    budget:createExecutionBudget({timeoutMs:30000,maxCalls:1})
  });
  assert.equal(calls.at(-1).url,'https://generic-gateway.test/v1/chat/completions');
  assert.equal(calls.at(-1).authorization,'Bearer generic-gateway-token');

  // With no Gateway pair, a bare OPENROUTER_API_KEY is not considered configured.
  delete vars.NETLIFY_AI_GATEWAY_KEY;delete vars.NETLIFY_AI_GATEWAY_URL;
  assert.equal(models.providerStatus().openrouter,false);
  assert.ok(!models.availableModels().some(model=>model.provider==='openrouter'));
  vars.OPENROUTER_DIRECT_API_KEY='explicit-break-glass-token';
  vars.OPENROUTER_DIRECT_BASE_URL='https://router-direct.test/v1';
  assert.equal(models.providerStatus().openrouter,false);
  assert.equal(models.providerTransportStatus().openrouter_direct,true);
  await models.callModel({provider:'openrouter',id:'x-ai/grok-4.5',transport:'openrouter_direct'},'system','direct fallback',{
    budget:createExecutionBudget({timeoutMs:30000,maxCalls:1})
  });
  assert.equal(calls.at(-1).url,'https://router-direct.test/v1/chat/completions');
  assert.equal(calls.at(-1).authorization,'Bearer explicit-break-glass-token');

  // Re-enable the four Gateway families and run a real mocked Zeus L3 dispatch.
  Object.assign(vars,{
    OPENROUTER_BASE_URL:'https://gateway-router.test/v1',
    OPENAI_BASE_URL:'https://gateway-openai.test/v1',
    ANTHROPIC_BASE_URL:'https://gateway-anthropic.test',
    GOOGLE_GEMINI_BASE_URL:'https://gateway-gemini.test',
  });
  delete vars.OPENROUTER_DIRECT_API_KEY;delete vars.OPENROUTER_DIRECT_BASE_URL;
  const before=calls.length;
  const result=await models.runZeus({text:'Create frontend UI',level:'ZEUS_DIRECTED',requirements:{items:[]},budget:createExecutionBudget({timeoutMs:120000,maxCalls:3,reserveMs:500})});
  const l3Calls=calls.slice(before);
  assert.equal(result.trace.roles.length,3);
  assert.equal(new Set(result.trace.roles.map(role=>role.family)).size,3);
  assert.ok(result.trace.roles.every(role=>role.transport==='gateway'));
  assert.equal(l3Calls.length,3);
  assert.ok(l3Calls.every(call=>call.url.includes('.test/')));

  const chat=await import('node:fs').then(({readFileSync})=>readFileSync('netlify/functions/chat.mjs','utf8'));
  assert.ok(chat.includes("levelDecision.level='IMAGE_GENERATION'"),'image tool must not claim Zeus L3 for a one-model image call');
  assert.ok(chat.includes("webIntent&&!toolWorkflow?'SIMPLE':gearLevel"),'dedicated Web tool must keep all three L3 roles after search');
  assert.ok(chat.includes('GEAR_CALL_CAPS.ZEUS_DIRECTED+1'),'dedicated Web tool budget includes web + three model calls');
  assert.ok(chat.includes('runOlympusCompoundPlus(')&&chat.includes('runOlympus('),'Olympus dispatch must retain both supported pipelines');

  console.log('Netlify Gateway credentials, explicit OpenRouter fallback, distinct L3 roles, and tool level routing: PASS');
}finally{
  globalThis.fetch=previousFetch;globalThis.Netlify=previousNetlify;
}
