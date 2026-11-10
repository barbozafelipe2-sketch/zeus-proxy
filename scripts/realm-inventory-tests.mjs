import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REALM_BLUEPRINT } from '../netlify/functions/_shared/realm-blueprint.mjs';
import { buildRealmInventory } from '../netlify/functions/_shared/realm-inventory.mjs';

const inventory = buildRealmInventory();
const frontend = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const teamView = frontend.slice(frontend.indexOf('function toolsView(){'), frontend.indexOf('\nfunction automationView()'));

assert.equal(inventory.version, REALM_BLUEPRINT.version);
assert.deepEqual(inventory.realms.map(realm => realm.id), REALM_BLUEPRINT.realms.map(realm => realm.id));
assert.deepEqual(inventory.internalCapabilities.map(realm => realm.id), ['hestia', 'mnemosine']);
assert.deepEqual(inventory.realms[0].workflows, [], 'Zeus must not appear to have an implemented model executor');
assert.equal(inventory.realms.find(realm => realm.id === 'athena').workflows.length, 2);
assert.equal(inventory.realms.find(realm => realm.id === 'hefesto').workflows[0].id, 'code');
assert.equal(inventory.internalCapabilities[0].workflows[0].id, 'analysis');
assert.ok(inventory.realms.every(realm => realm.models.every(model => model.id && model.family && typeof model.available === 'boolean')));
assert.equal(inventory.routingPolicy.directTextFallbackEnabled, false);
assert.deepEqual(inventory.routingPolicy.text, ['netlify_ai_gateway', 'openrouter_via_netlify_ai_gateway','google_direct','openai_direct']);
assert.deepEqual(Object.keys(inventory.voiceProviders), ['openaiRealtime', 'googleGeminiLive', 'elevenLabsRealtime']);
assert.ok(!JSON.stringify(inventory).match(/(?:sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,})/), 'model inventory must not expose credentials');
assert.ok(teamView.includes('inventory?.realms') && teamView.includes('realm.workflows'), 'Equipe must render Realm workflow associations returned by backend');
assert.ok(!teamView.includes('workflowIds='), 'Equipe must not maintain a second hard-coded workflow map');
assert.ok(frontend.includes("api('/api/realms')"), 'Equipe loads its runtime inventory from the backend');
console.log('Backend Realm inventory contract: PASS');
