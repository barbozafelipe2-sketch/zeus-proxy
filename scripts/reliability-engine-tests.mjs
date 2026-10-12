import assert from 'node:assert/strict';
import { classifyIntent, decideExecutionMode, decideExecutionLevel, normalizeRequestedMode } from '../netlify/functions/_shared/intent.mjs';
import { routeFor } from '../netlify/functions/_shared/models.mjs';
import { extractRequirementChecklist, shouldVerifyDelivery, validateAdversaryFindings, structuralRewriteAllowed } from '../netlify/functions/_shared/reliability.mjs';

const cases=[
  ['hello','ZEUS','CHAT','fast','SIMPLE',false,{}],
  ['Translate this to Portuguese: good morning','ZEUS','CHAT','fast','SIMPLE',false,{}],
  ['Write a birthday message','ZEUS','CHAT','writing','SIMPLE',false,{}],
  ['Create a logo for Zeus','ZEUS','IMAGE_CREATE','fast','SIMPLE',false,{}],
  ['Explain this screenshot','ZEUS','ANALYZE','vision','SIMPLE',false,{hasImage:true,hasFiles:true}],
  ['Fix this JavaScript bug','ZEUS','CHAT','coding','COMPOUND',true,{}],
  ['Implement this API endpoint','ZEUS','CHAT','coding','COMPOUND',true,{}],
  ['Deploy this production API safely','ZEUS','CHAT','hard','COMPOUND',true,{}],
  ['Audit this authentication code','ZEUS','ANALYZE','hard','COMPOUND',true,{}],
  ['Research the latest Netlify Gateway changes','ZEUS','CHAT','research','COMPOUND',true,{}],
  ['Create a PDF report','ZEUS','ARTIFACT_CREATE','fast','COMPOUND',true,{}],
  ['Audit this PDF','ZEUS','ANALYZE','hard','COMPOUND',true,{hasFiles:true}],
  ['Audit architecture, security, database implementation, and UI for production','OLYMPUS','ANALYZE','hard','COMPOUND_PLUS',true,{}],
  ['Reverse engineer this application architecture and security model','OLYMPUS','CHAT','hard','COMPOUND_PLUS',true,{}],
  ['Fix all findings from the audit','OLYMPUS','CHAT','coding','COMPLEX_TURBO',true,{hasFiles:true}],
  ['Implement the backend API, security permissions, frontend UI, and tests','OLYMPUS','CHAT','coding','COMPLEX_TURBO',true,{}],
  ['Create a ZIP project package','OLYMPUS','ARTIFACT_CREATE','fast','COMPLEX_TURBO',true,{}],
  ['hello','OLYMPUS','CHAT','fast','COMPOUND_PLUS',false,{}],
];

for(const [text,requestedMode,action,route,level,verify,opts] of cases){
  const intent=classifyIntent(text,opts);
  assert.equal(intent.action,action,`action: ${text}`);
  const routed=routeFor(text,{vision:Boolean(opts.hasImage)});
  assert.equal(routed,route,`route: ${text}`);
  const req=extractRequirementChecklist(text,{action:intent.action,artifactType:intent.artifactType,hasFiles:Boolean(opts.hasFiles),hasImage:Boolean(opts.hasImage)});
  const verification=shouldVerifyDelivery(text,{action:intent.action,route:routed,hasFiles:Boolean(opts.hasFiles),hasImage:Boolean(opts.hasImage)});
  assert.equal(verification,verify,`verify: ${text}`);
  const modeDecision=decideExecutionMode(text,{requestedMode});
  assert.equal(modeDecision.mode,requestedMode,`manual mode: ${text}`);
  assert.equal(modeDecision.router,'deterministic_zero_token');
  const levelDecision=decideExecutionLevel(text,{mode:modeDecision.mode,action:intent.action,route:routed,hasFiles:Boolean(opts.hasFiles),hasImage:Boolean(opts.hasImage),requirementCount:req.items.length,artifactType:intent.artifactType,requiresVerification:verification});
  assert.equal(levelDecision.level,level,`level: ${text} [${req.items.length} reqs]`);
  assert.equal(levelDecision.router,'deterministic_zero_token');
}

assert.equal(normalizeRequestedMode('olympus'),'OLYMPUS');
assert.equal(normalizeRequestedMode('ZEUS'),'ZEUS');
assert.equal(normalizeRequestedMode('provider-x'),null);
assert.equal(decideExecutionMode('Build a secure app with backend, security and UI',{requestedMode:'ZEUS'}).mode,'ZEUS','complexity must never auto-promote Zeus into Olympus');
assert.equal(decideExecutionMode('hello',{requestedMode:'OLYMPUS'}).mode,'OLYMPUS','manual Olympus must never auto-downgrade to Zeus');

const checklist=[{id:'R1',text:'Handle authentication errors.',evidence:'authentication',central:true}],answer='The handler calls validateToken() and then returns success. It also says authentication errors are always handled.',raw=JSON.stringify([{kind:'broken_reference',location:'handler',evidence:'validateToken()',defect:'The referenced function is not defined in the supplied answer.'},{kind:'missing_requirement',requirement_id:'R1',evidence:'authentication errors are always handled',defect:'The quoted claim does not show an error path for R1.'},{kind:'broken_reference',location:'handler',evidence:'not actually in answer',defect:'Invented evidence must be rejected.'}]),findings=validateAdversaryFindings(raw,{answer,checklist});
assert.equal(findings.length,2);assert.equal(structuralRewriteAllowed(findings,checklist),true);assert.equal(validateAdversaryFindings('[{"kind":"broken_reference","location":"x","evidence":"ghost()","defect":"This is an opinion without a real quote."}]',{answer,checklist}).length,0);
console.log('Zeus v3 deterministic mode/level routing tests: PASS');
