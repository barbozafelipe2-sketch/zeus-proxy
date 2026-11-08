import assert from 'node:assert/strict';
import {createExecutionBudget} from '../netlify/functions/_shared/runtime.mjs';
import {modelFamily} from '../netlify/functions/_shared/provider-routing.mjs';
import {priceFor} from '../netlify/functions/_shared/model-prices.mjs';
import {proposeAutomaticSkill} from '../netlify/functions/_shared/skill-engine.mjs';
import {executeThreeModelTool} from '../netlify/functions/_shared/tool-executor.mjs';

const previousFetch=globalThis.fetch,previousNetlify=globalThis.Netlify;
const vars={OPENROUTER_API_KEY:'gateway-test-token',OPENROUTER_BASE_URL:'https://gateway.example/v1'};
const calls=[];
globalThis.Netlify={env:{get:key=>vars[key]||''}};
globalThis.fetch=async(url,options={})=>{
  calls.push({url:String(url),body:JSON.parse(String(options.body||'{}'))});
  return new Response(JSON.stringify({choices:[{message:{content:'Poseidon answer'}}],usage:{prompt_tokens:12,completion_tokens:3}}),{status:200});
};

try{
  const models=await import(`../netlify/functions/_shared/models.mjs?poseidon=${Date.now()}`);
  const result=await models.runZeus({
    text:'Hello',level:'SIMPLE',requirements:{items:[]},
    budget:createExecutionBudget({timeoutMs:30000,maxCalls:1,reserveMs:100})
  });
  assert.equal(result.leadModel,'openrouter:x-ai/grok-4.3','Poseidon uses Grok 4.3 first');
  assert.equal(calls[0].body.model,'x-ai/grok-4.3','the Gateway request selects the configured Grok 4.3 ID');
  assert.deepEqual(priceFor('x-ai/grok-4.3'),{in:1.25,out:2.5},'usage has a known estimate');

  const toolRoles=models.roleCandidates('CREATOR','fix this code repository',{toolId:'code'});
  assert.ok(toolRoles.length>0,'specialist execution retains other available families');
  assert.ok(toolRoles.every(model=>modelFamily(model)!=='xai'),'Grok cannot occupy a specialist tool stage');
  const advertisedToolModels=models.toolModelCandidates('code','fix this code repository',{includeUnavailable:true});
  assert.ok(advertisedToolModels.every(model=>modelFamily(model)!=='xai'),'tool roster excludes the Poseidon model family');
  const executedFamilies=[];
  await executeThreeModelTool({
    toolId:'code',input:'Implement the requested change',
    budget:createExecutionBudget({timeoutMs:30000,maxCalls:3,reserveMs:100}),
    models:()=>[
      {provider:'openrouter',id:'x-ai/grok-4.3',family:'xai'},
      {provider:'openai',id:'gpt-4.1-mini',family:'openai'},
      {provider:'anthropic',id:'claude-sonnet-5',family:'anthropic'},
      {provider:'gemini',id:'gemini-3.5-flash',family:'gemini'}
    ],
    invoke:async({model})=>{executedFamilies.push(model.family);return 'specialist output';}
  });
  assert.deepEqual(executedFamilies,['openai','anthropic','gemini'],'tool executor rejects Grok even if a caller offers it');
  const managerRoles=models.roleCandidates('CEO','complete a complex task');
  assert.equal(managerRoles[0]?.id,'x-ai/grok-4.3','Poseidon remains the first manager/finalizer candidate');

  assert.equal(proposeAutomaticSkill({message:'Please audit the GitHub repository for broken routes'})?.toolId,'code','repository audits route to Hefesto');
  assert.equal(proposeAutomaticSkill({message:'Please compare online sources for current prices'})?.toolId,'web','explicit sourced research routes to Hermes');
  assert.equal(proposeAutomaticSkill({message:'What is a code repository?'}),null,'informational questions do not trigger a tool');
  assert.equal(proposeAutomaticSkill({message:'Create a project for my novel'}),null,'project-management requests do not route to the code specialist');
  console.log('Poseidon coordinator and specialist filter checks passed.');
}finally{
  globalThis.fetch=previousFetch;
  if(previousNetlify===undefined)delete globalThis.Netlify;else globalThis.Netlify=previousNetlify;
}
