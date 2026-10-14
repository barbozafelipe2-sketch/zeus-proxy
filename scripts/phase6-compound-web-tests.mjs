// Phase 6/7: Compound Plus must perform real web research when explicitly requested.
// All HTTP requests are mocked; there are no paid model/search calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runWebSearch,shouldSearchWeb} from '../netlify/functions/_shared/web-search.mjs';
import {createExecutionBudget} from '../netlify/functions/_shared/runtime.mjs';
import {GEAR_CALL_CAPS} from '../netlify/functions/_shared/intent.mjs';
import {publicExecutionFailure} from '../netlify/functions/_shared/execution-error.mjs';

const text='Pesquise as leis atuais de Miami e faça uma análise jurídica detalhada com fontes.';
const env={
  OPENAI_API_KEY:'fake-gateway',OPENAI_BASE_URL:'https://gateway.test/v1',
  ANTHROPIC_API_KEY:'fake-gateway',ANTHROPIC_BASE_URL:'https://gateway.test',
  OPENAI_STRONG_MODEL:'gpt-5.6-sol',OPENAI_MODEL:'gpt-5.6-luna',
  ANTHROPIC_STRONG_MODEL:'claude-sonnet-5'
};
const previousNetlify=globalThis.Netlify,previousFetch=globalThis.fetch;
globalThis.Netlify={env:{get:key=>env[key]||''}};
const network=[];
globalThis.fetch=async(url,options)=>{
  const request=JSON.parse(options.body);
  const web=String(url).endsWith('/responses');
  network.push({web,body:request});
  if(web)return new Response(JSON.stringify({
    id:'mock-web-id',output:[
      {type:'web_search_call',action:{sources:[{url:'https://www.flsenate.gov/Laws/Statutes',title:'Florida Statutes'}]}},
      {type:'message',content:[{type:'output_text',text:'Consulted the Florida statutes; current rules must be checked against the official text [1].'}]}
    ],usage:{input_tokens:110,output_tokens:30,total_tokens:140}
  }),{status:200,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({
    choices:[{message:{content:'Final, sourced legal analysis citing [1]'}}],
    content:[{type:'text',text:'Preliminary analysis citing [1]'}],
    candidates:[{content:{parts:[{text:'Preliminary analysis citing [1]'}]}}],
    usage:{prompt_tokens:100,completion_tokens:40}
  }),{status:200,headers:{'content-type':'application/json'}});
};

try{
  assert.equal(shouldSearchWeb(text),true);
  const models=await import('../netlify/functions/_shared/models.mjs');
  models.__resetProviderHealthForTests();
  const budget=createExecutionBudget({timeoutMs:140000,maxCalls:GEAR_CALL_CAPS.COMPOUND_PLUS,reserveMs:1000});
  const web=await runWebSearch(text,{budget,reserveAfterMs:17000});
  assert.equal(web.trace.status,'completed');
  assert.equal(web.sources.length,1);
  assert.ok(web.context.includes('www.flsenate.gov/Laws/Statutes'));
  const result=await models.runOlympusCompoundPlus({
    text,context:web.context,requirements:{items:[{id:'R1',text:'Analyze current law using retrieved sources',central:true}],ambiguous:false},
    budget,webResearchUsed:true
  });
  assert.equal(network.length,3,'live search + author + finalizer must use exactly 3 calls');
  assert.equal(network.filter(x=>x.web).length,1);
  assert.equal(network.filter(x=>!x.web).length,2);
  assert.equal(budget.snapshot().calls,3);
  assert.equal(budget.snapshot().maxCalls,3);
  assert.equal(result.trace.webResearchReplacedCritic,true);
  assert.equal(result.trace.critic,null);
  assert.equal(result.trace.independentCritic,false);
  assert.match(result.pipelineLabel,/web research.*author.*finalizer/i);
  assert.match(result.verificationLabel,/independent critique omitted/i);
  assert.ok(!network.some(x=>JSON.stringify(x.body).includes('independent CRITIC in Olympus Compound Plus')),'no separate reviewer may be charged in web route');
  assert.ok(network.some(x=>!x.web&&JSON.stringify(x.body).includes('www.flsenate.gov/Laws/Statutes')),'model prompt must include web evidence');
  // Existing non-web pipeline keeps the independent critic option intact.
  assert.ok(readFileSync('netlify/functions/_shared/models.mjs','utf8').includes("const criticCandidates=webResearchUsed?[]:olympusCriticCandidates("));

  const chat=readFileSync('netlify/functions/chat.mjs','utf8');
  assert.ok(chat.includes('const webIntent=shouldSearchWeb(modelText)&&!isImageOp;'),'Compound Plus must not suppress web');
  assert.ok(chat.includes("const compoundPlusWithWeb=actualMode==='OLYMPUS'&&level==='COMPOUND_PLUS'&&webIntent"));
  assert.ok(chat.includes("web.trace?.status!=='completed'||!Array.isArray(web.sources)||!web.sources.length"),'do not claim verification with no sources');
  assert.ok(chat.includes('webResearchUsed:compoundPlusWithWeb'),'web route must skip critic in model orchestration');
  assert.ok(chat.includes("modeExplanation+=' Live web research replaces the independent critic"));
  const fail=publicExecutionFailure({code:'WEB_RESEARCH_UNAVAILABLE',status:503,message:'contains untrusted raw credential'});
  assert.equal(fail.code,'WEB_RESEARCH_UNAVAILABLE');
  assert.equal(fail.status,503);
  assert.match(fail.message,/web research/i);
  assert.ok(!fail.message.includes('credential'));
  console.log('Phase 6/7: web + author + finalizer = 3 calls; sources required, no fake critique: PASS');
}finally{
  globalThis.fetch=previousFetch;
  globalThis.Netlify=previousNetlify;
}
