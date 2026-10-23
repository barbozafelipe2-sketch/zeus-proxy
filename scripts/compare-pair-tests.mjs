import assert from 'node:assert/strict';
import {runIndependentArtifactPair} from '../netlify/functions/_shared/compare-pair.mjs';

const models=[
  {provider:'anthropic',id:'writer-a'},
  {provider:'openrouter',id:'writer-b'},
  {provider:'anthropic',id:'writer-c'}
];
const calls=[];
const result=await runIndependentArtifactPair({text:'Design a family travel planner',context:'Family project',type:'pdf',contract:'Return one PDF manifest.',budget:{maxCalls:2}}, {
  candidates:()=>models,
  family:model=>model.provider,
  call:async(model,system,prompt,options)=>{calls.push({model,system,prompt,options});return model.id;},
  parse:(raw,types)=>({artifacts:[{type:types[0],title:raw,content:raw}]})
});
assert.deepEqual(result.variants.map(v=>v.label),['A','B']);
assert.deepEqual(result.families,['anthropic','openrouter']);
assert.equal(calls.length,2);
assert.ok(calls.every(c=>c.prompt.includes('Design a family travel planner')));
assert.ok(calls.every(c=>!c.prompt.includes('writer-a')&&!c.prompt.includes('writer-b')),'variants must not see each other or model IDs');
assert.ok(calls.every(c=>c.options.budget.maxCalls===2));

let paidCalls=0;
await assert.rejects(()=>runIndependentArtifactPair({text:'x',type:'pdf',contract:'x',budget:{}},{
  candidates:()=>[models[0],models[2]],family:model=>model.provider,
  call:async()=>{paidCalls++;},parse:()=>({artifacts:[{}]})
}),e=>e.code==='COMPARE_FAMILIES_UNAVAILABLE');
assert.equal(paidCalls,0,'refuse same-family pseudo-comparisons before any provider call');
console.log('Independent A/B generation family isolation: PASS');
