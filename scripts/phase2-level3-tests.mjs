import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decideExecutionLevel,GEAR_CALL_CAPS} from '../netlify/functions/_shared/intent.mjs';
import {runDirectedPipeline} from '../netlify/functions/_shared/zeus-directed.mjs';

for(const message of ['Build frontend UI ZIP','Create backend API service ZIP','Generate PowerPoint presentation']){
 const decision=decideExecutionLevel(message,{mode:'ZEUS',action:'ARTIFACT_CREATE'});
 assert.equal(decision.level,'ZEUS_DIRECTED',message);
 assert.equal(decision.maxCalls,3);
 assert.equal(decision.router,'deterministic_zero_token');
}
assert.equal(GEAR_CALL_CAPS.ZEUS_DIRECTED,3);
assert.equal(decideExecutionLevel('Hello',{mode:'ZEUS'}).level,'SIMPLE');
const observations=[];
const budget={reserveMs:6500,remaining:()=>50000,snapshot:()=>({calls:observations.length,maxCalls:3})};
const providers={CREATOR:'gemini',DIRECTOR:'anthropic',CEO:'openai'};
const candidates=(role,text,options)=>[{provider:providers[role],id:role.toLowerCase(),cost:1}];
const call=async(model,system,prompt,opts)=>{
 observations.push({role:model.id,prompt,opts});
 return model.id.toUpperCase()+' OUTPUT';
};
const result=await runDirectedPipeline({text:'Build backend',requirements:{items:[]},budget},{candidates,call,family:model=>model.provider});
assert.deepEqual(observations.map(x=>x.role),['creator','director','ceo']);
assert.equal(result.trace.roles.length,3);
assert.equal(new Set(result.trace.roles.map(role=>role.family)).size,3,'L3 must call three distinct model families');
assert.ok(result.trace.roles.every(role=>role.transport==='gateway'));
assert.equal(result.content,'CEO OUTPUT');
assert.match(observations[1].prompt,/CREATOR OUTPUT/);
assert.match(observations[2].prompt,/DIRECTOR OUTPUT/);
assert.equal(observations.every(x=>x.opts.maxOutputTokens>0),true);
let failures=0;
await assert.rejects(()=>runDirectedPipeline({text:'Build backend',budget},{
 candidates,call:async()=>{failures++;throw Error('down')},family:model=>model.provider
}),/down/);
assert.equal(failures,1,'Do not cascade paid retries on failure');
let limitedCalls=0;
await assert.rejects(()=>runDirectedPipeline({text:'Build backend',requirements:{items:[]},budget},{
 candidates:(role)=>[{provider:'gemini',id:role.toLowerCase()}],
 call:async()=>{limitedCalls++;return 'partial'},family:model=>model.provider
}),error=>error.code==='AI_LEVEL3_FAMILY_UNAVAILABLE');
assert.equal(limitedCalls,1,'L3 must stop instead of disguising repeated-family calls as three models');
const chat=readFileSync('netlify/functions/chat.mjs','utf8');
assert.match(chat,/zeusLevel==='ZEUS_DIRECTED'/);
console.log('Zeus Level 3 route and mocked model stages PASS');
