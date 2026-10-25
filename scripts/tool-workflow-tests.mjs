import assert from 'node:assert/strict';
import { TOOL_WORKFLOWS,getToolWorkflow,toolConversationTitle,recordToolFeedback,pickToolCandidate } from '../netlify/functions/_shared/tool-workflows.mjs';
import { imageGeneratorCandidates } from '../netlify/functions/_shared/models.mjs';

assert.equal(Object.keys(TOOL_WORKFLOWS).length,5);
assert.equal(new Set(Object.values(TOOL_WORKFLOWS).map(tool=>tool.god)).size,5,'each tool has one distinct owner deity');
assert.equal(toolConversationTitle('images'),'Apollo · Images');
assert.equal(getToolWorkflow('unknown'),null);

const candidates=Array.from({length:6},(_,index)=>({provider:'test',id:`model-${index}`}));
let preferences={};
for(let index=0;index<5;index++)preferences=recordToolFeedback(preferences,'code',['test:model-4'],'up');
assert.equal(preferences.code.standard,'test:model-4','five explicit positive ratings establish a provisional standard');
assert.equal(pickToolCandidate(candidates,'code',preferences,()=>0).id,'model-4','the standard receives preference when not exploring');
assert.equal(pickToolCandidate(candidates,'code',{},()=>0.1).id,'model-0','the default prompt-ranked candidate remains eligible');
assert.equal(pickToolCandidate(candidates,'code',{},()=>0.2).id,'model-1','exploration rotates a different candidate');

const mixed=recordToolFeedback(preferences,'images',['openrouter:qwen/qwen-image-2.1-pro'],'choose');
assert.equal(mixed.images.models['openrouter:qwen/qwen-image-2.1-pro'].likes,1,'choosing a compared image stores positive preference');
assert.equal(mixed.code.standard,'test:model-4','feedback stays isolated to its tool');
assert.equal(recordToolFeedback({},'code',['bad model key'],'up'),null,'invalid provider/model keys are ignored');

const savedEnv={openrouter:process.env.OPENROUTER_API_KEY,openai:process.env.OPENAI_API_KEY,fetch:globalThis.fetch};
process.env.OPENROUTER_API_KEY='test-openrouter-key';delete process.env.OPENAI_API_KEY;
globalThis.fetch=async url=>{
  assert.match(String(url),/\/images\/models$/);
  const ids=['qwen/qwen-image-2.1-pro','bytedance-seed/seedream-5.0-flash','black-forest-labs/flux-3-image-klein','tencent/hy-image-3.5','recraft/recraft-v4','ideogram/ideogram-3.0','google/gemini-image','meta/muse-image'];
  return Response.json({data:ids.map(id=>({id,name:id.split('/')[1],architecture:{input_modalities:['text'],output_modalities:['image']}}))});
};
const imagePool=await imageGeneratorCandidates({limit:6});
assert.deepEqual(imagePool.map(model=>model.id),['qwen/qwen-image-2.1-pro','bytedance-seed/seedream-5.0-flash','black-forest-labs/flux-3-image-klein','tencent/hy-image-3.5','recraft/recraft-v4','ideogram/ideogram-3.0'],'image roster discovers six diverse image providers including Qwen');
assert.equal(new Set(imagePool.map(model=>model.family)).size,6,'image roster has no duplicate provider family');
globalThis.fetch=savedEnv.fetch;
if(savedEnv.openrouter===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=savedEnv.openrouter;
if(savedEnv.openai===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedEnv.openai;
console.log('Tool workflow tests passed: one deity per tool, isolated preference learning, standard selection and exploration.');
