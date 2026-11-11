import assert from 'node:assert/strict';
import {executeThreeModelTool,ToolExecutionError} from '../netlify/functions/_shared/tool-executor.mjs';
const models=({usedFamilies})=>['openai','anthropic','gemini'].filter(f=>!usedFamilies.includes(f)).map(f=>({provider:f,id:f+'-test',family:f}));
const result=await executeThreeModelTool({toolId:'web',input:'test',models,invoke:async({role})=>'ok '+role});
assert.equal(result.trace.completedStages,3);assert.equal(new Set(result.trace.roles.map(x=>x.family)).size,3);
await assert.rejects(()=>executeThreeModelTool({toolId:'web',input:'test',models:()=>[],invoke:async()=>''}),e=>e instanceof ToolExecutionError);
let paidCalls=0;
await assert.rejects(
 ()=>executeThreeModelTool({toolId:'web',input:'test',models,invoke:async()=>{paidCalls++;return 'paid result';},onStage:async()=>{throw Object.assign(new Error('progress storage unavailable'),{code:'PROGRESS_WRITE_FAILED'});}}),
 error=>error instanceof ToolExecutionError&&error.code==='TOOL_STAGE_REPORT_FAILED'&&error.details.completed.length===1&&error.details.attempts.length===1
);
assert.equal(paidCalls,1,'a failed progress callback must never trigger another paid model call');

assert.equal(result.trace.capabilityExecuted,false,'three LLM stages are not a tool execution');
assert.equal(result.trace.capabilityReceipt,null,'model-only stages cannot invent external receipts');
const unverified=await executeThreeModelTool({toolId:'web',input:'test',models,invoke:async()=>'LLM only',
 capability:async()=>({artifact:'A model claim without an external receipt'})});
assert.equal(unverified.trace.capabilityExecuted,false,'truthy callback result is not proof');
const verified=await executeThreeModelTool({toolId:'web',input:'test',models,invoke:async()=>'analysis',
 capability:async()=>({artifact:null,receipt:{kind:'web_search',status:'completed',requestId:'search-123',sourceCount:2}})});
assert.equal(verified.trace.capabilityExecuted,true,'server proof confirms real read operation');
assert.equal(verified.trace.capabilityReceipt.kind,'web_search');
const spoof=await executeThreeModelTool({toolId:'documents',input:'create PDF',models,invoke:async()=>'done',
 capability:async()=>({receipt:{kind:'artifact_saved',artifacts:[{id:'11111111-1111-4111-8111-111111111111',size:10,type:'pdf'}]}})});
assert.equal(spoof.trace.capabilityExecuted,false,'a callback cannot attest a DB artifact insert');
console.log('Three-model tool executor passed');