import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Protective invariants from the current OlyHub governance blueprint.
// The blueprint contains historical call-count proposals that conflict;
// this guard must NEVER decide the number of models or syntheses.
// Felipe may replace the engine while preserving the safety contracts.
const read=path=>readFileSync(path,'utf8');
const models=read('netlify/functions/_shared/models.mjs');
const directed=read('netlify/functions/_shared/zeus-directed.mjs');
const chat=read('netlify/functions/chat.mjs');
const tool=read('netlify/functions/_shared/tool-executor.mjs');
const receipts=read('netlify/functions/_shared/tool-execution-evidence.mjs');
const billing=read('netlify/functions/_shared/provider-observability.mjs');
const prices=read('netlify/functions/_shared/model-prices.mjs');
const worker=read('netlify/functions/_shared/worker-lease.mjs');
const ui=read('public/app.js');
const invariant=(condition,message)=>assert.ok(condition,'Blueprint compatibility: '+message);

// Keep the approved coordinator separate from specialist model execution.
invariant(models.includes('function poseidonPreferredModelId('),'Poseidon preferred model must remain configurable');
invariant(models.includes("modelFamily(m)==='xai'"),'xAI must stay excluded from the specialist roles');
invariant(directed.includes("preferFirstModel:role==='CEO'&&!toolId"),'Grok-first owner-facing director preference must survive');

// The temporary 3-model engine is intentionally NOT locked here. Model-call
// count and whether Poseidon synthesizes each task require a later owner decision.
// What must survive any rebuild is an explicit backend-owned specialist route.
invariant(chat.includes('executeThreeModelTool({')||chat.includes('toolWorkflow'),'specialist execution route removed');
invariant(chat.includes('toolResultReturnedToPoseidon:true')||chat.includes('poseidonFinalizer'),
  'specialist handoff to Poseidon must remain supported');

// Real capability evidence is mandatory and cannot be inferred from LLM text.
invariant(chat.includes('const outcome=toolExecutionEvidence({'),'capability evidence must be decided after persistence');
for(const state of ['model_only','read_verified','artifact_saved'])
  invariant(receipts.includes(state),'tool execution status missing: '+state);
invariant(ui.includes("state.currentToolId==='code'"),'explicit code mutations must still reach Code Agent');

// Pricing is an estimate, not the provider invoice. Unknown calls must not
// silently count as US$0. Do not disable worker fences or scope controls.
invariant(billing.includes('unknownCostCalls'),'cost telemetry must preserve unknown charges');
invariant(billing.includes("estimateCoverage"),'cost coverage must be explicit');
invariant(prices.includes('return p&&Number.isFinite'),'unknown model prices must not be fabricated');
invariant(worker.includes('dispatch_token')&&worker.includes('worker_token')&&worker.includes('assertWorkerFence'),
  'worker dispatch and fencing cannot be bypassed');
invariant(chat.includes('queueOlympusExecution')&&chat.includes('claimOlympusWorker'),'background queue must stay fenced');
console.log('Approved Zeus Proxy blueprint compatibility checks PASS');
