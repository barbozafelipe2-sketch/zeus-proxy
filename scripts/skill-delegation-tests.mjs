import assert from 'node:assert/strict';
import {executeSkillDelegation,requestedSkillDelegation} from '../netlify/functions/_shared/skill-delegation.mjs';
let count=0;
const execute=async()=>{count++;return {trace:{completedStages:3,capabilityExecuted:false}};};
const base={sourceSkillId:'hefesto.code',targetSkillId:'athena.research',allowedToolIds:['web'],remainingCalls:1,execute};
assert.equal((await executeSkillDelegation({...base,remainingCalls:0})).reason,'budget_exhausted');
assert.equal((await executeSkillDelegation({...base,allowedToolIds:[]})).reason,'permission_denied');
assert.equal(count,0);
const result=await executeSkillDelegation(base);
assert.equal(result.executed,true);
assert.equal(result.trace.externalActionConfirmed,false);
assert.equal(count,1);
console.log('Skill delegation boundaries: PASS');

assert.equal(requestedSkillDelegation('pesquise na web', 'hefesto.code'),null);
assert.equal(requestedSkillDelegation('delegue para Athena a pesquisa','hefesto.code')?.id,'athena.research');
assert.equal(requestedSkillDelegation('delegate to Hephaestus','athena.research')?.id,'hefesto.code');
assert.equal(requestedSkillDelegation('delegue a pesquisa para Athena e o código para Hefesto','apollo.images'),null);
