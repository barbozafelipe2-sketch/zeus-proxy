import assert from 'node:assert/strict';
import {executeThreeModelTool,ToolExecutionError} from '../netlify/functions/_shared/tool-executor.mjs';
const models=({usedFamilies})=>['openai','anthropic','gemini'].filter(f=>!usedFamilies.includes(f)).map(f=>({provider:f,id:f+'-test',family:f}));
const result=await executeThreeModelTool({toolId:'web',input:'test',models,invoke:async({role})=>'ok '+role});
assert.equal(result.trace.completedStages,3);assert.equal(new Set(result.trace.roles.map(x=>x.family)).size,3);
await assert.rejects(()=>executeThreeModelTool({toolId:'web',input:'test',models:()=>[],invoke:async()=>''}),e=>e instanceof ToolExecutionError);
console.log('Three-model tool executor passed');