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

const savedEnv={openrouter:process.env.OPENROUTER_API_KEY,base:process.env.OPENROUTER_BASE_URL,openai:process.env.OPENAI_API_KEY,fetch:globalThis.fetch};
process.env.OPENROUTER_API_KEY='test-gateway-openrouter-key';process.env.OPENROUTER_BASE_URL='https://gateway.fixture/v1';delete process.env.OPENAI_API_KEY;
globalThis.fetch=async()=>{throw Error('The fixed image roster must not perform catalog discovery.');};
const imagePool=await imageGeneratorCandidates({limit:6});
assert.deepEqual(imagePool.map(model=>model.id),['openai/gpt-image-2.5-flare','x-ai/grok-imagine-image-2.0','qwen/qwen-image-3-pro','black-forest-labs/flux-3-image','recraft/recraft-v4.1-pro','google/gemini-3.1-flash-image'],'image roster presents the six fixed model families');
assert.equal(new Set(imagePool.map(model=>model.family)).size,6,'image roster has no duplicate provider family');
globalThis.fetch=savedEnv.fetch;
if(savedEnv.openrouter===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=savedEnv.openrouter;
if(savedEnv.base===undefined)delete process.env.OPENROUTER_BASE_URL;else process.env.OPENROUTER_BASE_URL=savedEnv.base;
if(savedEnv.openai===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedEnv.openai;
console.log('Tool workflow tests passed: one deity per tool, isolated preference learning, standard selection and exploration.');
