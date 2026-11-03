import assert from 'node:assert/strict';
import {executeThreeModelTool} from '../netlify/functions/_shared/tool-executor.mjs';
const models=({usedFamilies})=>['openai','anthropic','gemini','qwen'].filter(f=>!usedFamilies.includes(f)).map(f=>({provider:f,id:f+'-test',family:f}));
const result=await executeThreeModelTool({toolId:'code',input:'test',models,invoke:async({role,model})=>{if(role==='CREATOR'&&model.family==='openai')throw Error('transient');return 'ok '+role;}});
assert.equal(result.trace.completedStages,3);assert.equal(result.trace.attempts.filter(a=>a.status==='failed').length,1);
console.log('Three-model fallback passed');