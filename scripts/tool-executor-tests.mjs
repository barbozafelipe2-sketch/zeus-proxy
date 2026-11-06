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
console.log('Three-model tool executor passed');