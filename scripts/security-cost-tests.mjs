import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {aiLimits,guardAiExecution} from '../netlify/functions/_shared/limits.mjs';
import * as ai from '../netlify/functions/_shared/models.mjs';
import {snapshotProviderTelemetry} from '../netlify/functions/_shared/provider-observability.mjs';
import {dangerousPath,githubRepoAllowlist,assertGithubRepoAllowed} from '../netlify/functions/_shared/github-write.mjs';
const variables={};
const prev=globalThis.Netlify,oldFetch=globalThis.fetch;
globalThis.Netlify={env:{get:key=>variables[key]||''}};
try{
 assert.equal(aiLimits('ZEUS').concurrent,2);assert.equal(aiLimits('OLYMPUS').concurrent,1);
 assert.equal('hourly' in aiLimits('ZEUS'),false);assert.equal('hourly' in aiLimits('OLYMPUS'),false);
 for(const file of ['netlify/functions/chat.mjs','netlify/functions/transcribe.mjs','netlify/functions/speech.mjs','netlify/functions/_shared/execution-error.mjs'])assert.ok(!readFileSync(file,'utf8').includes('AI_RATE_LIMIT'),`${file} must not retain obsolete AI hourly-limit handling`);
 variables.OLYHUB_ZEUS_CONCURRENCY='4';assert.equal(aiLimits('ZEUS').concurrent,4);delete variables.OLYHUB_ZEUS_CONCURRENCY;
 function fakeDb(state='new'){
  return {async query(q){
   if(q.includes('request_id=$2'))return {rows:state==='new'?[]:[{id:'exec',state}]};
   if(q.includes('pg_advisory_xact_lock'))return {rows:[]};
   if(q.includes('FILTER'))return {rows:[{zeus:0,olympus:0}]};
   if(q.includes('FROM execution_attempts WHERE owner_id=$1 AND mode=$2'))throw new Error('Hourly cap query must not run.');
   return {rows:[]};
  }};
 }
 for(let i=0;i<40;i++)await guardAiExecution(fakeDb('new'),'one','ZEUS',`z-${i}`);
 for(let i=0;i<8;i++)await guardAiExecution(fakeDb('new'),'one','OLYMPUS',`o-${i}`);
 assert.deepEqual(githubRepoAllowlist(),[]);
 assert.throws(()=>assertGithubRepoAllowed('https://github.com/acme/demo'),e=>e.code==='GITHUB_ALLOWLIST_REQUIRED');
 variables.GITHUB_REPO_ALLOWLIST='acme/demo';
 assert.equal(assertGithubRepoAllowed('https://github.com/acme/demo').repo,'demo');
 assert.throws(()=>assertGithubRepoAllowed('https://github.com/acme/evil'),e=>e.code==='GITHUB_REPO_NOT_ALLOWED');
 for(const item of ['.env','.env.local','.npmrc','service_account.json','.aws/credentials','key.pem','terraform.tfstate'])assert.ok(dangerousPath(item));
 const workflow=readFileSync('.github/workflows/smoke-live.yml','utf8');
 assert.ok(!/^\s*schedule\s*:/m.test(workflow));
 assert.ok(workflow.includes('confirm_paid_ai')&&workflow.includes('yes-spend-credits'));
 const gi=readFileSync('.gitignore','utf8');
 for(const name of ['.env','.env.*','!.env.example','*.pem'])assert.ok(gi.split('\n').includes(name));
 // Mocks guarantee the security-cost suite never sends live model requests.
 const config={GEMINI_API_KEY:'fake',GOOGLE_GEMINI_BASE_URL:'https://gateway.fixture',OPENAI_API_KEY:'fake',OPENAI_BASE_URL:'https://gateway.fixture/v1'};
 Object.assign(variables,config);
 ai.__resetProviderHealthForTests();
 let callCount=0;
 globalThis.fetch=async url=>{callCount++;const status=402;return {ok:false,status,json:async()=>({error:{message:'Insufficient credits'}})};};
 const {createExecutionBudget}=await import('../netlify/functions/_shared/runtime.mjs');
 const budget=createExecutionBudget({timeoutMs:30000,maxCalls:4});
 await assert.rejects(()=>ai.executeWithFallback('hi','sys','hi',{budget,maxAttempts:4}),e=>e.code==='AI_PROVIDER_QUOTA');
 assert.equal(callCount,1,'shared Gateway credits must not cascade');
 assert.equal(snapshotProviderTelemetry(budget).modelCalls,1);
 ai.__resetProviderHealthForTests();
 let ids=[];
 globalThis.fetch=async url=>{
  const match=String(url).match(/models\/([^:]+):/);const id=match?decodeURIComponent(match[1]):'';
  ids.push(id);
  const status=ids.length===1?404:200;
  return {ok:status===200,status,json:async()=>status===200?{candidates:[{content:{parts:[{text:'ok'}]}}],choices:[{message:{content:'ok'}}]}:{error:{message:'Model does not exist'}}};
 };
 const b=createExecutionBudget({timeoutMs:30000,maxCalls:4});
 const ans=await ai.executeWithFallback('hi','sys','hi',{budget:b,maxAttempts:4});
 assert.equal(ans.content,'ok');
 assert.ok(ai.knownInvalidModels().length>0);
 assert.ok(readdirSync('public').length>0);
 console.log('Security/cost and paid-call prevention regression: PASS');
}finally{globalThis.Netlify=prev;globalThis.fetch=oldFetch;ai.__resetProviderHealthForTests();}
