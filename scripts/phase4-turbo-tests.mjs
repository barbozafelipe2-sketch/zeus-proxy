import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const models=readFileSync('netlify/functions/_shared/models.mjs','utf8');
const chat=readFileSync('netlify/functions/chat.mjs','utf8');

assert.ok(models.includes("strategy:'olympus_complex_turbo_roles'"),'Complex Turbo role pipeline missing');
assert.ok(models.includes("maxCreators:3"),'Turbo creator cap must be 3');
assert.ok(models.includes("maxCalls:10"),'Turbo call cap must be 10');
assert.ok(models.includes("roleCandidates('PLANNER'"),'Planner role routing missing');
assert.ok(models.includes("roleCandidates('CREATOR'"),'Creator role routing missing');
assert.ok(models.includes("roleCandidates('DIRECTOR'"),'Director role routing missing');
assert.ok(models.includes("roleCandidates('CEO'"),'CEO role routing missing');
assert.ok(models.includes("excludeProviders:creatorProviders"),'Director must exclude creator provider families');
assert.ok(models.includes("directorIndependent=!creatorProviders.includes(director.model.provider)"),'Director independence must be verified');
assert.ok(models.includes("Planner → Creators → independent Director → CEO"),'Turbo pipeline label missing');
assert.ok(models.includes("effectiveLevel:'COMPOUND_PLUS'"),'Turbo must degrade safely when role separation cannot be preserved');
assert.ok(chat.includes("TURBO_LIMITS.maxCalls"),'Chat must enforce the Turbo call cap');
assert.ok(chat.includes("result.effectiveLevel||"),'Chat must persist a safe Turbo downgrade level');

console.log('Zeus v3 phase-4 Complex Turbo role/cap tests: PASS');
