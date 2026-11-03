import assert from 'node:assert/strict';
import {SKILL_REGISTRY,selectSkill,authorizeSkillInvocation,skillExecutionLabel} from '../netlify/functions/_shared/skill-engine.mjs';
assert.equal(selectSkill({message:'Cria uma foto de um dragão',activeSkillId:'ares.defense'}).skillId,'apolo.images');
assert.equal(selectSkill({message:'Cria uma foto de um dragão',activeSkillId:'ares.defense'}).delegated,true);
assert.equal(selectSkill({message:'Como está o projeto?'}).status,'existing_router');
assert.equal(selectSkill({message:'Audite as permissões',activeSkillId:'ares.defense'}).status,'not_implemented');
assert.equal(authorizeSkillInvocation({skillId:'apolo.images',allowedToolIds:['web'],remainingCalls:3}).reason,'permission_denied');
assert.equal(authorizeSkillInvocation({skillId:'apolo.images',allowedToolIds:['images'],remainingCalls:0}).reason,'budget_exhausted');
assert.equal(authorizeSkillInvocation({skillId:'apolo.images',allowedToolIds:['images'],remainingCalls:1,depth:3}).reason,'delegation_limit');
assert.equal(authorizeSkillInvocation({skillId:'apolo.images',allowedToolIds:['images'],remainingCalls:1}).allowed,true);
assert.equal(authorizeSkillInvocation({skillId:'ares.defense',allowedToolIds:['images'],remainingCalls:1}).allowed,false);
assert.equal(skillExecutionLabel('apolo.images'),'Executado por Apollo');
assert.equal(SKILL_REGISTRY['dionisio.video'].enabled,false);

import {readFileSync} from 'node:fs';
const chatSource=readFileSync(new URL('../netlify/functions/chat.mjs',import.meta.url),'utf8');
assert.match(chatSource,/authorizeSkillInvocation\(/);
assert.match(chatSource,/skill\.enabled&&skill\.toolId===toolId/);
assert.match(chatSource,/result\.trace=\{\.\.\.\(result\.trace\|\|\{\}\),skillId:matchingSkill\.id/);
assert.match(chatSource,/skillExecuted:true/);
assert.ok(chatSource.indexOf('result=await executeThreeModelTool({')<chatSource.indexOf('skillExecuted:true'),'execution must precede skill attribution');

console.log('Skill Engine policy tests passed');
