// Phase 7/7: unknown usage and web/tool fees cannot masquerade as zero or full coverage.
// Pure local tests. No provider/network/database calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordProviderAttempt,snapshotProviderTelemetry,summarizeRequestUsage} from '../netlify/functions/_shared/provider-observability.mjs';

const known={stage:'answer',provider:'openai',model:'gpt-4.1-mini',outcome:'success',inputTokens:1_000_000,outputTokens:1_000_000};
const missing={...known,stage:'no_usage',inputTokens:null,outputTokens:null};
const unknownPrice={...known,stage:'unknown_model',model:'unlisted-pricing-model'};
const failed={...known,stage:'failed',outcome:'failure',inputTokens:null,outputTokens:null};
const telemetry=(attempts,budgetCalls=attempts.length)=>({attempts,budgetCalls});
const base=summarizeRequestUsage(telemetry([known]),{maxCalls:3});
assert.equal(base.estimatedUsd,2,'known 1M+1M price must remain correct');
assert.equal(base.estimateCoverage,'full');
assert.equal(base.estimateLabel,'estimated');
assert.equal(base.inputTokens,1_000_000);
assert.equal(base.outputTokens,1_000_000);
assert.equal(base.totalTokens,2_000_000);
assert.equal(base.maxCalls,3);
assert.equal(summarizeRequestUsage(telemetry([known])).maxCalls,null,'null maxCalls is unknown, not zero');

const noUsage=summarizeRequestUsage(telemetry([missing]));
assert.equal(noUsage.estimatedUsd,null,'price without reported token counts is unknown');
assert.equal(noUsage.estimateCoverage,'none');
assert.equal(noUsage.inputTokens,null);
assert.equal(noUsage.outputTokens,null);
assert.equal(noUsage.totalTokens,null);
assert.equal(noUsage.byRole[0].inputTokens,null);
assert.equal(noUsage.byRole[0].estimatedUsd,null);
assert.equal(noUsage.unknownCostCalls,1);

const mixed=summarizeRequestUsage(telemetry([known,missing,unknownPrice,failed]),{maxCalls:4});
assert.equal(mixed.estimatedUsd,2,'show known subtotal, never add fake zero unknown costs');
assert.equal(mixed.estimateCoverage,'partial');
assert.equal(mixed.estimateLabel,'known_subtotal');
assert.equal(mixed.unknownCostCalls,3);
assert.equal(mixed.inputTokens,null);
assert.equal(mixed.totalTokens,null);
assert.equal(mixed.reportedInputTokens,2_000_000,'known token subtotal remains visible separately');
assert.equal(mixed.tokenCoverage,'partial');
assert.equal(mixed.byRole[1].estimatedUsd,null);
assert.equal(mixed.byRole[2].estimatedUsd,null);
assert.equal(mixed.byRole[3].estimatedUsd,null);

const webTrace={name:'web_search',status:'completed',attempted:true,provider:'openai',model:'gpt-5.5',
  usage:{inputTokens:100,outputTokens:20}};
const web=summarizeRequestUsage(telemetry([known],2),{maxCalls:3,webTrace});
assert.equal(web.estimateCoverage,'partial','search tool fees unknown even with token usage');
assert.equal(web.estimatedUsd,2,'only known model portion is included in subtotal');
assert.equal(web.webSearch.toolFeesIncluded,false);
assert.equal(web.webSearch.estimatedUsd,null);
assert.equal(web.webSearch.inputTokens,100);
assert.equal(web.inputTokens,1000100);
assert.equal(web.totalTokens,2000120);
assert.equal(web.unknownCostCalls,1);

const webMissing=summarizeRequestUsage(telemetry([known],2),{
  webTrace:{name:'web_search',status:'completed',attempted:true,usage:{inputTokens:null,outputTokens:null}}
});
assert.equal(webMissing.inputTokens,null);
assert.equal(webMissing.totalTokens,null);
assert.equal(webMissing.estimatedUsd,2);
assert.equal(webMissing.estimateCoverage,'partial');
const webFailed=summarizeRequestUsage(telemetry([],1),{webTrace:{name:'web_search',status:'failed',attempted:true}});
assert.equal(webFailed.callsUsed,1);
assert.equal(webFailed.estimatedUsd,null);
assert.equal(webFailed.unknownCostCalls,1);
assert.equal(webFailed.inputTokens,null);
assert.equal(webFailed.estimateCoverage,'none');
const webNotRun=summarizeRequestUsage(telemetry([known]),{webTrace:{name:'web_search',status:'not_configured'}});
assert.equal(webNotRun.estimateCoverage,'full','skipped/not configured searches have no incurred tool fee');
const unseen=summarizeRequestUsage(telemetry([known],2));
assert.equal(unseen.estimateCoverage,'partial','untracked call under the budget may be billable');
assert.equal(unseen.untrackedCalls,1);

const trueZero=summarizeRequestUsage(telemetry([{...known,inputTokens:0,outputTokens:0}]));
assert.equal(trueZero.estimatedUsd,0,'actual reported zero tokens is valid');
assert.equal(trueZero.inputTokens,0);
assert.equal(trueZero.estimateCoverage,'full');
const unpriced=summarizeRequestUsage(telemetry([unknownPrice]));
assert.equal(unpriced.estimatedUsd,null);
assert.equal(unpriced.estimateCoverage,'none');

const tokenBudget={snapshot:()=>({calls:1})};
recordProviderAttempt(tokenBudget,{model:{id:'gpt-4.1-mini',provider:'openai'},stage:'answer',usage:null});
const snapshot=snapshotProviderTelemetry(tokenBudget);
assert.equal(snapshot.inputTokens,null,'telemetry must not erase missing input tokens');
assert.equal(snapshot.outputTokens,null);
assert.equal(summarizeRequestUsage(snapshot).estimatedUsd,null);

const chat=readFileSync('netlify/functions/chat.mjs','utf8');
const ui=readFileSync('public/app.js','utf8');
const webSource=readFileSync('netlify/functions/_shared/web-search.mjs','utf8');
assert.ok(chat.includes('webTrace:webUsageTrace'),'successful execution must carry web fee coverage metadata');
assert.ok(chat.includes('failedUsage=summarizeRequestUsage('),'failed executions must carry truthful usage breakdown');
assert.ok(ui.includes("x===null||x===undefined||x===''?'unknown'"),'UI must show unknown, never force zero');
assert.ok(ui.includes('Known cost subtotal')&&ui.includes('Cost unknown'),'UI must distinguish known subtotal and unknown');
assert.ok(webSource.includes('attempted=true'),'web API attempt must be tracked even if it fails');
assert.ok(webSource.includes('status:\'failed\',attempted'),'failed web search may still be billable');
assert.ok(webSource.includes("if(value===undefined||value===null||value==='')return null;"),'web usage omissions must remain null');
assert.ok(!JSON.stringify(mixed).includes('some secret prompt'),'usage must not contain message text');
console.log('Phase 7/7: tokens null, unpriced model, web fee, failed attempts, and UI unknown: PASS');
