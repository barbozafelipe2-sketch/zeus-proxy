import assert from 'node:assert/strict';
import {createExecutionBudget} from '../netlify/functions/_shared/runtime.mjs';
import {shouldSearchWeb} from '../netlify/functions/_shared/web-search.mjs';
import {isModelIdentityQuestion,actualModelAnswer,addUnverifiedWebNotice} from '../netlify/functions/_shared/response-integrity.mjs';
import {modelFamily} from '../netlify/functions/_shared/provider-routing.mjs';
import {priceFor} from '../netlify/functions/_shared/model-prices.mjs';
import {proposeAutomaticSkill} from '../netlify/functions/_shared/skill-engine.mjs';
import {executeThreeModelTool} from '../netlify/functions/_shared/tool-executor.mjs';

const previousFetch=globalThis.fetch,previousNetlify=globalThis.Netlify;
const vars={
  OPENROUTER_API_KEY:'gateway-test-token',OPENROUTER_BASE_URL:'https://gateway.example/v1',
  GEMINI_API_KEY:'native-gemini-test',GOOGLE_GEMINI_BASE_URL:'https://gemini-gateway.example'
};
const calls=[];
let rejectGrok=false;
globalThis.Netlify={env:{get:key=>vars[key]||''}};
globalThis.fetch=async(url,options={})=>{
  const target=String(url),body=JSON.parse(String(options.body||'{}'));
  calls.push({url:target,body});
  if(rejectGrok&&body.model==='x-ai/grok-4.3')return new Response(JSON.stringify({error:{message:'Model not found'}}),{status:404});
  if(target.includes('gemini-gateway.example'))return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Gemini recovery answer'}]}}]}),{status:200});
  return new Response(JSON.stringify({choices:[{message:{content:'Poseidon answer'}}],usage:{prompt_tokens:12,completion_tokens:3},...(body.tools?{citations:['https://docs.x.ai/developers/models/grok-4.3']}: {})}),{status:200});
};

try{
  const models=await import(`../netlify/functions/_shared/models.mjs?poseidon=${Date.now()}`);
  const result=await models.runZeus({
    text:'Hello',level:'SIMPLE',requirements:{items:[]},
    budget:createExecutionBudget({timeoutMs:30000,maxCalls:1,reserveMs:100})
  });
  assert.equal(result.leadModel,'openrouter:x-ai/grok-4.3','Poseidon uses its configured Grok engine even when native Gateway alternatives are ready');
  assert.equal(calls[0].body.model,'x-ai/grok-4.3','the coordinator must not silently substitute a cheaper model');
  assert.equal(result.trace.coordinator.preferredModel,result.leadModel);
  assert.equal(result.trace.coordinator.fallbackUsed,false);
  assert.equal(calls[0].body.tools,undefined,'Ordinary calls without the search flag must stay unchanged');
  assert.equal(shouldSearchWeb('Quais versões do Grok existem?'),true);
  assert.equal(shouldSearchWeb('Olá tudo bem?'),false);
  assert.equal(isModelIdentityQuestion('Oi qual modelo vc tá usando'),true);
  assert.equal(isModelIdentityQuestion('Compare os modelos de IA'),false);
  assert.match(actualModelAnswer('openrouter:x-ai/grok-4.3'),/Grok|grok-4.3/);
  assert.equal(actualModelAnswer('invalid'),'\u006e\u0075\u006c\u006c'==='null'?null:null);
  assert.equal(addUnverifiedWebNotice('Texto',{needsCurrentEvidence:true,hasSources:false}).includes('Verificação pendente'),true);
  assert.equal(addUnverifiedWebNotice('Texto',{needsCurrentEvidence:true,hasSources:true}),'Texto');
  calls.length=0;
  const webReply=await models.runZeus({text:'Quais versões do Grok existem?',level:'SIMPLE',openRouterWebSearch:true,requirements:{items:[]},
    budget:createExecutionBudget({timeoutMs:30000,maxCalls:1,reserveMs:100})});
  assert.equal(webReply.leadModel,'openrouter:x-ai/grok-4.3');
  assert.equal(calls[0].body.tools?.[0]?.type,'openrouter:web_search','Search must be made available to Poseidon directly');
  assert.equal(calls[0].body.max_tool_calls,2,'Search must be bounded');
  assert.equal(webReply.sources.length,1,'Only API-returned citations are treated as web evidence');
  assert.equal(webReply.trace.openRouterWebSearch.status,'sources_returned');
  calls.length=0;
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

  // The same canonical manager preference applies to a two-stage answer.
  calls.length=0;
  const compound=await models.runZeus({text:'Write a substantial report',level:'COMPOUND',
    requirements:{items:[]},budget:createExecutionBudget({timeoutMs:120000,maxCalls:2,reserveMs:100})});
  assert.equal(compound.trace.base.model!=='x-ai/grok-4.3',true,'the author remains independent of the manager');
  assert.equal(compound.trace.finalizer.model,'x-ai/grok-4.3','Compound manager also retains Grok priority');
  assert.equal(calls.at(-1).body.model,'x-ai/grok-4.3');

  // Level 3's CEO must also preserve Grok precedence rather than silently
  // promoting a native provider selected for the independent specialist roles.
  calls.length=0;
  const directed=await models.runZeus({text:'Design a small service architecture',
    level:'ZEUS_DIRECTED',requirements:{items:[]},
    budget:createExecutionBudget({timeoutMs:120000,maxCalls:3,reserveMs:100})});
  assert.equal(directed.trace.roles.length,3);
  assert.equal(directed.trace.roles[2].model,'x-ai/grok-4.3');
  assert.equal(calls.at(-1).body.model,'x-ai/grok-4.3');

  // A rejected primary model must recover transparently, without impersonating Grok.
  calls.length=0;rejectGrok=true;
  const recovered=await models.runZeus({text:'Hello',level:'SIMPLE',
    requirements:{items:[]},budget:createExecutionBudget({timeoutMs:40000,maxCalls:4,reserveMs:100})});
  assert.notEqual(recovered.leadModel,'openrouter:x-ai/grok-4.3');
  assert.equal(recovered.trace.coordinator.actualModel,recovered.leadModel);
  assert.equal(recovered.trace.coordinator.fallbackUsed,true);
  assert.equal(recovered.trace.coordinator.failureAttempts,1);
  assert.equal(calls[0].body.model,'x-ai/grok-4.3','Grok was tried before the recovery provider');
  assert.ok(calls.length>=2,'a second provider call actually occurred');

  // No Grok Gateway must not make chat unavailable; the actual provider is disclosed.
  calls.length=0;delete vars.OPENROUTER_API_KEY;delete vars.OPENROUTER_BASE_URL;
  const missing=await models.runZeus({text:'Hello',level:'SIMPLE',
    requirements:{items:[]},budget:createExecutionBudget({timeoutMs:30000,maxCalls:2,reserveMs:100})});
  assert.equal(missing.leadModel,'gemini:gemini-3.5-flash');
  assert.equal(missing.trace.coordinator.fallbackUsed,true);
  assert.equal(missing.trace.coordinator.failureAttempts,0);
  assert.equal(calls[0].url.includes('gemini-gateway.example'),true);

  assert.equal(proposeAutomaticSkill({message:'Please audit the GitHub repository for broken routes'})?.toolId,'code','repository audits route to Hefesto');
  assert.equal(proposeAutomaticSkill({message:'Please compare online sources for current prices'})?.toolId,'web','explicit sourced research routes to Athena');
  assert.equal(proposeAutomaticSkill({message:'What is a code repository?'}),null,'informational questions do not trigger a tool');
  assert.equal(proposeAutomaticSkill({message:'Create a project for my novel'}),null,'project-management requests do not route to the code specialist');
  console.log('Poseidon coordinator and specialist filter checks passed.');
}finally{
  globalThis.fetch=previousFetch;
  if(previousNetlify===undefined)delete globalThis.Netlify;else globalThis.Netlify=previousNetlify;
}
