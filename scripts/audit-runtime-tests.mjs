import assert from 'node:assert/strict';
import {buildContext} from '../netlify/functions/chat.mjs';
import {buildRealmInventory} from '../netlify/functions/_shared/realm-inventory.mjs';
import {availableTextModels,providerTransportStatus,roleCandidates,toolModelCandidates} from '../netlify/functions/_shared/models.mjs';
import {createExecutionBudget} from '../netlify/functions/_shared/runtime.mjs';
import {recordProviderAttempt,snapshotProviderTelemetry,summarizeTransportEvidence} from '../netlify/functions/_shared/provider-observability.mjs';

const pending=[];
const db={sql(strings,...values){
  const query=strings.join('?');
  if(query.includes('project_id IS NULL'))return Promise.resolve([]);
  assert.ok(values.includes('owner-test'),'every project context query retains its owner filter');
  assert.ok(values.includes('project-test'),'every project context query retains its project filter');
  return new Promise(resolve=>pending.push({query,resolve}));
}};
const contextPromise=buildContext({db,userId:'owner-test',projectId:'project-test',currentText:'hello',attachmentRows:[]});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(pending.length,7,'all independent project reads start before any finishes');
for(const item of pending)item.resolve(item.query.includes('FROM projects WHERE')?[{name:'Scoped Project',goal:'A goal',status:'ACTIVE',progress:25}]:[]);
const result=await contextPromise;
assert.ok(result.context.includes('Scoped Project'));
assert.equal(result.receipt.projectScoped,true);

const prior=globalThis.Netlify;
try{
  globalThis.Netlify={env:{get:key=>key==='OPENAI_DIRECT_API_KEY'?'direct-test':''}};
  assert.equal(providerTransportStatus().openai_direct,true);
  assert.ok(availableTextModels().some(model=>model.transport==='openai_direct'));
  assert.equal(buildRealmInventory().routingPolicy.directTextFallbackEnabled,true);
  assert.ok(roleCandidates('CREATOR','implement code',{toolId:'code'}).some(m=>m.transport==='openai_direct'));
  assert.ok(toolModelCandidates('code','implement code').some(m=>m.transport==='openai_direct'));
  assert.ok(availableTextModels({vision:true}).length,'direct multimodal fallback is advertised when configured');
}finally{globalThis.Netlify=prior;}
const budget=createExecutionBudget();
recordProviderAttempt(budget,{model:{provider:'openrouter',id:'x-ai/grok-4.3'},error:Object.assign(new Error('unavailable'),{status:503})});
recordProviderAttempt(budget,{model:{provider:'openai',id:'test',transport:'openai_direct'}});
const telemetry=snapshotProviderTelemetry(budget);
assert.equal(telemetry.independentFallbackUsed,true,'direct recovery must not be reported as unused');
const evidence=summarizeTransportEvidence([{trace:{providerTelemetry:telemetry}}],{gateway:true,openai_direct:true},{openrouter:{configured:true,circuitOpen:true}});
assert.equal(evidence.gateway.status,'degraded');
assert.equal(evidence.openai_direct.status,'observed_healthy','Gateway circuit must not degrade independent direct recovery');
assert.equal(evidence.openai_direct.recoveredExecutions,1);
console.log('Parallel scoped context, direct-only availability and independent recovery telemetry: PASS');
