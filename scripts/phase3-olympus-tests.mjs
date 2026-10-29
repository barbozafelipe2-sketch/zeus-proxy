import assert from 'node:assert/strict';
import { createExecutionBudget } from '../netlify/functions/_shared/runtime.mjs';

const envVars={
  OPENAI_API_KEY:'openai-test',
  OPENAI_BASE_URL:'https://openai.test/v1',
  OPENAI_STRONG_MODEL:'gpt-5.6-sol',
  OPENAI_MODEL:'gpt-5.6-luna',
  ANTHROPIC_API_KEY:'anthropic-test',
  ANTHROPIC_BASE_URL:'https://anthropic.test',
};
globalThis.Netlify={env:{get:(name)=>envVars[name]||''}};

const originalFetch=globalThis.fetch;
const calls=[];
globalThis.fetch=async(url,options={})=>{
  const target=String(url),body=JSON.parse(String(options.body||'{}'));
  const anthropic=target.includes('anthropic.test');
  const system=anthropic?String(body.system||''):String(body.messages?.[0]?.content||'');
  const provider=anthropic?'anthropic':'openai';
  calls.push({provider,model:body.model,system});
  if(/GPT FINALIZER/i.test(system)){
    assert.equal(provider,'openai');
    return new Response(JSON.stringify({choices:[{message:{content:'FINAL OLYMPUS ANSWER'}}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(/independent CRITIC/i.test(system)){
    const review={verdict:'revise',findings:[{requirement_id:'R1',evidence:'BASE ANSWER',problem:'Missing a deployment caveat.',correction:'Add the caveat.'}],missing_requirements:[],notes:'One concrete correction.'};
    return new Response(JSON.stringify(anthropic?{content:[{type:'text',text:JSON.stringify(review)}]}:{choices:[{message:{content:JSON.stringify(review)}}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  assert.match(system,/AUTHOR stage of Olympus Compound Plus/i);
  return new Response(JSON.stringify(anthropic?{content:[{type:'text',text:'BASE ANSWER'}]}:{choices:[{message:{content:'BASE ANSWER'}}]}),{status:200,headers:{'content-type':'application/json'}});
};

try{
  const models=await import(`../netlify/functions/_shared/models.mjs?phase3=${Date.now()}`);
  models.__resetProviderHealthForTests();
  const result=await models.runOlympusCompoundPlus({
    text:'Audit this deployment architecture and identify what must change.',
    requirements:{items:[{id:'R1',text:'Audit the deployment architecture.',evidence:'Audit this deployment architecture',central:true}],ambiguous:false},
    budget:createExecutionBudget({timeoutMs:60000,maxCalls:7,reserveMs:1000}),
  });
  assert.equal(result.content,'FINAL OLYMPUS ANSWER');
  assert.equal(result.trace.strategy,'olympus_compound_plus_author_critic_gpt');
  assert.equal(result.trace.executionLevel,'COMPOUND_PLUS');
  assert.equal(result.trace.gptFinished,true);
  assert.equal(result.trace.independentCritic,true);
  assert.equal(calls.length,3,'Compound Plus must be author + independent critic + GPT finalizer on the happy path');
  assert.notEqual(calls[0].provider,calls[1].provider,'author and critic must use independent provider families');
  assert.match(calls[0].system,/AUTHOR stage of Olympus Compound Plus/i);
  assert.match(calls[1].system,/independent CRITIC/i);
  assert.equal(calls[2].model,'gpt-5.6-sol','strong GPT must deliver the final answer');
  assert.match(result.pipelineLabel,/author → independent critic → GPT final/);
}finally{
  globalThis.fetch=originalFetch;
  delete globalThis.Netlify;
}
console.log('Zeus v3 phase-3 Olympus Compound Plus tests: PASS');
