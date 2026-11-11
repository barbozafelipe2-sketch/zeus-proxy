import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {specialistCallPlan,specialistMaxCalls} from '../netlify/functions/_shared/specialist-call-policy.mjs';
import {executeThreeModelTool} from '../netlify/functions/_shared/tool-executor.mjs';

const plan=(text,toolId='code',intentAction='CHAT')=>specialistCallPlan({toolId,text,intentAction});
const standard=plan('Fix the backend for this request');
assert.equal(standard.modelStages,1,'ordinary requests use one specialist, not three');
assert.equal(standard.poseidonSynthesis,false,'Poseidon must not silently repeat an answer');
assert.equal(specialistMaxCalls(standard),2,'one successful stage plus a failure-only recovery slot');
assert.equal(specialistMaxCalls(standard,{web:true}),3,'live research uses its own call');
assert.equal(specialistMaxCalls(standard,{delegation:true}),3,'delegation must be explicitly budgeted');

const audit=plan('Audita a arquitetura e aponta falhas','analysis');
assert.equal(audit.modelStages,2,'an explicit audit should retain independent review');
assert.equal(audit.reason,'explicit_independent_review');
assert.equal(plan('Audit the backend configuration','analysis').modelStages,2);
assert.equal(specialistMaxCalls(audit),3);
const triple=plan('Verifique isso com três modelos independentes','analysis');
assert.equal(triple.modelStages,3);
assert.equal(specialistMaxCalls(triple),4);
const synthesized=plan('Poseidon sintetize o resultado do Hefesto');
assert.equal(synthesized.poseidonSynthesis,true);
assert.equal(specialistMaxCalls(synthesized),3);
assert.equal(plan('Explain this code').modelStages,1,'a read-only explanation is not an audit');

const imageDirect=plan('Cria uma imagem do meu produto','images','IMAGE_CREATE');
assert.equal(imageDirect.imagePlanning,false);
assert.equal(imageDirect.modelStages,0);
assert.equal(specialistMaxCalls(imageDirect,{imageAttempts:2}),2);
const imagePlanning=plan('Faça planejamento visual antes de criar a imagem','images','IMAGE_CREATE');
assert.equal(imagePlanning.imagePlanning,true);
assert.equal(specialistMaxCalls(imagePlanning,{imageAttempts:2}),4);
assert.equal(plan('Remova o fundo desta imagem','images','IMAGE_EDIT').imagePlanning,false);

const models=({usedFamilies})=>['gemini','openai','deepseek'].filter(x=>!usedFamilies.includes(x))
  .map(family=>({provider:family,id:family+'-mock',family}));
let calls=0;
const invoke=async({role})=>{calls++;return 'Resultado '+role;};
const one=await executeThreeModelTool({toolId:'code',input:'Fix bug',models,invoke,modelStages:1});
assert.equal(calls,1);
assert.equal(one.trace.completedStages,1);
assert.equal(one.trace.independentFamilies,false);
assert.match(one.pipelineLabel,/1 model analysis stage/);
assert.equal(one.leadModel,'gemini:gemini-mock');
assert.equal(one.trace.capabilityExecuted,false);
calls=0;
const two=await executeThreeModelTool({toolId:'analysis',input:'Audit',models,invoke,modelStages:2});
assert.equal(calls,2);
assert.deepEqual(two.trace.roles.map(x=>x.role),['CREATOR','DIRECTOR']);
assert.equal(two.trace.independentFamilies,true);
calls=0;
let recoveryCalls=0;
const recovered=await executeThreeModelTool({toolId:'code',input:'Recover',models,
 modelStages:1,invoke:async({model})=>{
   recoveryCalls++;
   if(model.family==='gemini')throw Object.assign(new Error('Temporary upstream failure'),{code:'UPSTREAM_FAILURE'});
   return 'Recovered content';
 }});
assert.equal(recoveryCalls,2,'second model is called ONLY after a failure');
assert.equal(recovered.trace.completedStages,1);
assert.equal(recovered.trace.attempts.filter(x=>x.status==='failed').length,1);
assert.equal(recovered.leadModel,'openai:openai-mock');

const three=await executeThreeModelTool({toolId:'web',input:'Compare 3',models,invoke,modelStages:3});
assert.equal(calls,3);
assert.equal(three.trace.completedStages,3);
assert.equal(new Set(three.trace.roles.map(r=>r.family)).size,3);

const chat=readFileSync(new URL('../netlify/functions/chat.mjs',import.meta.url),'utf8');
assert.match(chat,/modelStages:specialistPlan\.modelStages/);
assert.match(chat,/const maxCalls=comparePair\?2:compareAnswerToMessageId\?4:isImageOp/);
assert.match(chat,/specialistMaxCalls\(specialistPlan,\{web:webIntent,delegation:explicitDelegationRequested\}\)/);
assert.match(chat,/if\(specialistPlan\.poseidonSynthesis\)/);
assert.match(chat,/if\(toolWorkflow&&specialistPlan\?\.imagePlanning/);
assert.match(chat,/modelStages:1/);
assert.ok(chat.includes('capabilityExecuted:outcome.capabilityExecuted'),'evidence contract must remain intact');
console.log('Specialist single-call budgets, optional reviews, image preflight and execution trace: PASS');
