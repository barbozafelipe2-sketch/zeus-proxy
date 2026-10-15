import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {maxModelCostCents,authorizeOlympusModelCall} from '../netlify/functions/_shared/olympus-budget.mjs';
import {runDirectedPipeline} from '../netlify/functions/_shared/zeus-directed.mjs';
assert.equal(maxModelCostCents('unknown-or-unpriced-model',100,100),null);
const noModel={id:'unknown-or-unpriced-model',provider:'unknown'};
const noDb={pool:{connect(){throw Error('Unpriced provider should never touch the DB');}}};
await assert.rejects(()=>authorizeOlympusModelCall(noDb,{ownerId:'user',executionId:'job',model:noModel,system:'x',user:'y'}),e=>e.code==='OLYMPUS_UNKNOWN_MODEL_PRICE');
const saved=[{phaseLabel:'CREATOR',content:'Existing specialist code',model:'openai:original-model'}];
const calls=[],checkpointed=[];
const b={reserveMs:6500,remaining:()=>49000,snapshot:()=>({calls:calls.length,maxCalls:3})};
const result=await runDirectedPipeline({text:'Build backend',budget:b,resumeStages:saved,onStage:v=>checkpointed.push(v)},{
 candidates:role=>[{id:role.toLowerCase(),provider:'mock'}],
 call:async model=>{calls.push(model.id);return model.id+' generated';},
 family:()=> 'mock'
});
assert.deepEqual(calls,['director','ceo']);
assert.deepEqual(checkpointed.map(x=>x.phaseNumber),[1,2,3]);
assert.match(result.content,/ceo generated/);
const app=readFileSync('public/app.js','utf8');
const chat=readFileSync('netlify/functions/chat.mjs','utf8');
const model=readFileSync('netlify/functions/_shared/models.mjs','utf8');
assert.match(app,/Approve \+\$5/);
assert.match(app,/expectedAuthorizedCents/);
assert.match(app,/resumeExecutionId/);
assert.match(chat,/original_metadata\?\.attachments/);
assert.match(chat,/OLYMPUS_UNPRICED_ROUTE/);
assert.match(model,/authorizeProviderCall/);
console.log('Production safety: unpriced model block, stage resume, explicit approval PASS');
