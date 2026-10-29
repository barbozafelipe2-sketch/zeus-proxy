import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {modelFamily,buildTransportRoutes} from '../netlify/functions/_shared/provider-routing.mjs';
import {snapshotProviderTelemetry} from '../netlify/functions/_shared/provider-observability.mjs';
import * as models from '../netlify/functions/_shared/models.mjs';

assert.equal(modelFamily({provider:'openrouter',id:'anthropic/claude-sonnet-4.5',transport:'openrouter_direct'}),'anthropic');
const routes=buildTransportRoutes([
 {provider:'openai',id:'gpt-5'},{provider:'anthropic',id:'claude'},{provider:'gemini',id:'flash'}
],{limit:3,gatewayEnabled:()=>true,openrouterDirect:true,openaiDirect:true});
assert.equal(routes.length,3);
assert.ok(routes.every(route=>route.transport==='gateway'));
assert.equal(new Set(routes.map(route=>route.provider)).size,3);

const source=readFileSync('netlify/functions/_shared/models.mjs','utf8');
for(const forbidden of ['OPENROUTER_DIRECT_API_KEY','OPENAI_DIRECT_API_KEY','https://api.openai.com','https://openrouter.ai/api/v1'])
 assert.ok(!source.includes(forbidden),'direct provider route remains in runtime models');
assert.equal(snapshotProviderTelemetry({snapshot:()=>({calls:0})}).modelCalls,0);
models.__resetProviderHealthForTests();
console.log('Gateway-only routing regression checks: PASS');
