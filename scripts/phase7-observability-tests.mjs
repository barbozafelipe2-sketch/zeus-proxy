import assert from 'node:assert/strict';
import {createExecutionBudget} from '../netlify/functions/_shared/runtime.mjs';
import {recordProviderAttempt,snapshotProviderTelemetry,summarizeTransportEvidence} from '../netlify/functions/_shared/provider-observability.mjs';
import * as models from '../netlify/functions/_shared/models.mjs';

const budget=createExecutionBudget({timeoutMs:10000,maxCalls:2});
recordProviderAttempt(budget,{model:{provider:'openrouter',id:'x-ai/grok-4.5',transport:'openrouter_direct'},stage:'critic',durationMs:20});
let telemetry=snapshotProviderTelemetry(budget);
assert.equal(telemetry.modelCalls,1);
assert.deepEqual(telemetry.byTransport,{gateway:1});
assert.equal(telemetry.independentFallbackUsed,false);
assert.equal(telemetry.attempts[0].transport,'gateway');
assert.equal(telemetry.attempts[0].family,'xai');

const health=summarizeTransportEvidence([{observed_at:new Date().toISOString(),trace:{providerTelemetry:telemetry}}],{gateway:true},{openrouter:{configured:true,circuitOpen:false}});
assert.equal(health.gateway.configured,true);
assert.equal(health.gateway.attempts,1);

models.__resetProviderHealthForTests();
models.__recordProviderFailureForTests('openai');
assert.equal(models.providerRuntimeHealth().openai.consecutiveFailures,1);
assert.equal(models.providerRuntimeHealth().openai_direct,undefined);
models.__resetProviderHealthForTests();
console.log('Gateway-only provider telemetry: PASS');
