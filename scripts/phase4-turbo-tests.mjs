import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const models=readFileSync('netlify/functions/_shared/models.mjs','utf8');
const chat=readFileSync('netlify/functions/chat.mjs','utf8');

assert.ok(models.includes("strategy:'olympus_complex_turbo_roles'"),'Complex Turbo role pipeline missing');
assert.ok(models.includes("maxCreators:2"),'Turbo creator cap must be 2');
assert.ok(models.includes("maxCalls:4"),'Turbo call cap must be 4');
assert.ok(!models.includes("roleCandidates('PLANNER'"),'Turbo must not spend an LLM call on a Planner');
assert.ok(!models.includes("turboPlannerSystem"),'Planner prompt must be removed');
assert.ok(chat.includes("creatorCount:turboCreatorCount"),'Chat must pass the deterministic team size');
assert.ok(chat.includes("GEAR_CALL_CAPS[gearLevel]"),'Turbo web search must count inside the 4-call cap');
assert.ok(models.includes("roleCandidates('CREATOR'"),'Creator role routing missing');
assert.ok(models.includes("roleCandidates('DIRECTOR'"),'Director role routing missing');
assert.ok(models.includes("roleCandidates('CEO'"),'CEO role routing missing');
assert.ok(models.includes("excludeProviders:creatorProviders"),'Director must exclude creator provider families');
assert.ok(models.includes("directorIndependent=!creatorProviders.includes(modelFamily(director.model))"),'Director independence must be verified');
assert.ok(models.includes("Specialists → independent Director → CEO"),'Turbo pipeline label missing');
assert.ok(models.includes("effectiveLevel:'COMPOUND_PLUS'"),'Turbo must degrade safely when role separation cannot be preserved');
assert.ok(chat.includes("GEAR_CALL_CAPS"),"Chat must enforce the gear call caps");
assert.ok(chat.includes("result.effectiveLevel||"),'Chat must persist a safe Turbo downgrade level');

console.log('Zeus v3 phase-4 Complex Turbo role/cap tests: PASS');
