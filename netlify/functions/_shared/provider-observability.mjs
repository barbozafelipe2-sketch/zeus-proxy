import { modelFamily, modelTransport } from './provider-routing.mjs';
import { priceFor } from './model-prices.mjs';

// Per-execution audit events: no prompt, response body, files, personal data, raw errors or secrets.
const attemptsByBudget=new WeakMap();
const safe=(x,n=96)=>String(x||'').replace(/[^A-Za-z0-9_./:-]/g,'').slice(0,n);
const transports=new Set(['gateway']);
const clamp=(n,max)=>Math.min(max,Math.max(0,Number(n)||0));
export function failureCategory(error){
  const code=safe(error?.code,48).toUpperCase();
  const status=Number(error?.status||error?.statusCode||0);
  const name=safe(error?.name,48);
  if(code==='PROVIDER_CIRCUIT_OPEN')return 'circuit_open';
  if(code==='EXECUTION_BUDGET_EXHAUSTED'||code==='EXECUTION_DEADLINE')return 'budget';
  if(name==='AbortError'||name==='TimeoutError'||/TIMEOUT/i.test(code))return 'timeout';
  if(status===401||status===403)return 'auth';
  if(status===402)return 'quota';
  if(status===429)return 'rate_limit';
  if(code==='PROVIDER_MODEL_INVALID_CACHED')return 'model_invalid_cached';
  if(status===404)return 'model_unavailable';
  if(status===400||status===413||status===422)return 'invalid_request';
  if(status===408||status===504)return 'timeout';
  if(status>=500)return 'upstream';
  return 'network_or_unknown';
}
export function recordProviderAttempt(budget,{model,stage='unspecified',durationMs=0,error=null,usage=null}={}){
  if(!budget||typeof budget!=='object'||!model)return;
  let events=attemptsByBudget.get(budget);
  if(!events){events=[];attemptsByBudget.set(budget,events);}
  if(events.length>=24)return;
  const transport=modelTransport(model),status=Number(error?.status||error?.statusCode||0);
  events.push({
    stage:safe(stage,48)||'unspecified',
    transport:transports.has(transport)?transport:'gateway',
    provider:safe(model.provider,36),
    family:safe(modelFamily(model),36),
    model:/^(?:sk-|rk-|ghp_|gho_|AIza)/i.test(safe(model.id,100))?'redacted-model-id':safe(model.id,100),
    outcome:error?'failure':'success',
    durationMs:Math.round(clamp(durationMs,180000)),
    ...(usage&&!error?{inputTokens:Number.isFinite(usage.inputTokens)?usage.inputTokens:null,outputTokens:Number.isFinite(usage.outputTokens)?usage.outputTokens:null}:{}),
    ...(error?{failureClass:failureCategory(error),status:status>=400&&status<=599?status:null}:{})
  });
}
export function snapshotProviderTelemetry(budget){
  const events=Array.isArray(attemptsByBudget.get(budget))?attemptsByBudget.get(budget).map(v=>({...v})):[];
  const success=events.filter(e=>e.outcome==='success');
  const failed=events.filter(e=>e.outcome==='failure');
  const budgetCalls=budget?.snapshot?.()?.calls;
  return {
    version:1,modelCalls:events.length,budgetCalls:Number.isFinite(budgetCalls)?budgetCalls:null,
    succeeded:success.length,failed:failed.length,
    recovered:failed.length>0&&success.length>0,
    // Null means the provider omitted usage: never misrepresent missing tokens as zero.
    inputTokens:events.length&&events.some(e=>!Number.isFinite(e.inputTokens))?null:events.reduce((n,e)=>n+(Number.isFinite(e.inputTokens)?e.inputTokens:0),0),
    outputTokens:events.length&&events.some(e=>!Number.isFinite(e.outputTokens))?null:events.reduce((n,e)=>n+(Number.isFinite(e.outputTokens)?e.outputTokens:0),0),
    byTransport:events.reduce((acc,e)=>{acc[e.transport]=(acc[e.transport]||0)+1;return acc;},{}),
    independentFallbackUsed:false,
    attempts:events
  };
}
export function summarizeTransportEvidence(rows=[],configuration={},runtime={}){
  const result={};
  for(const route of ['gateway']){
    let successes=0,failures=0,lastOutcome=null,lastSeenAt=null,recoveredExecutions=0;
    for(const row of rows){
      const events=Array.isArray(row?.trace?.providerTelemetry?.attempts)?row.trace.providerTelemetry.attempts:[];
      const onRoute=events.filter(e=>e?.transport===route&&(e.outcome==='success'||e.outcome==='failure'));
      if(!onRoute.length)continue;
      for(const event of onRoute){if(event.outcome==='success')successes++;else failures++;}
      if(lastOutcome===null){lastOutcome=onRoute[onRoute.length-1].outcome;lastSeenAt=row.observed_at?new Date(row.observed_at).toISOString():null;}
      if(route!=='gateway'&&events.some(e=>e.transport==='gateway'&&e.outcome==='failure')&&onRoute.some(e=>e.outcome==='success'))recoveredExecutions++;
    }
    const configured=Boolean(configuration[route]);
    const circuitOpen=Object.values(runtime).some(data=>data?.configured&&data?.circuitOpen);
    const status=!configured?'not_configured':circuitOpen?'degraded':lastOutcome==='success'?'observed_healthy':lastOutcome==='failure'?'recent_failure':'configured_unverified';
    result[route]={configured,status,circuitOpen,attempts:successes+failures,successes,failures,lastOutcome,lastSeenAt,recoveredExecutions};
  }
  return result;
}

// Missing provider usage, unknown prices, potentially billable failed requests,
// and web search tool fees MUST NOT be reported as $0 or as complete coverage.
// Prices are estimates only; the provider/gateway invoice is authoritative.
function tokenCount(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?n:null;
}
function totals(items,key){
  const known=items.reduce((a,item)=>a+(item[key]??0),0);
  const missing=items.filter(item=>item[key]===null).length;
  return {value:missing?null:known,known,missing};
}
export function summarizeRequestUsage(telemetry={},{maxCalls=null,webUsage=null,webTrace=null}={}){
  const attempts=Array.isArray(telemetry?.attempts)?telemetry.attempts:[];
  const countedCalls=tokenCount(telemetry?.budgetCalls);
  const callsUsed=countedCalls??attempts.length;
  const webAttempted=Boolean(
    webTrace&&(webTrace.attempted===true||webTrace.status==='completed') ||
    (!webTrace&&webUsage&&typeof webUsage==='object')
  );
  // Status from the web tool, not invented from token metrics alone.
  const webStatus=webTrace?.status||null;
  const webData=webUsage&&typeof webUsage==='object'?webUsage:
    webTrace?.usage&&typeof webTrace.usage==='object'?webTrace.usage:null;
  const web=webAttempted?{
    status:webStatus||'recorded',
    inputTokens:tokenCount(webData?.inputTokens),
    outputTokens:tokenCount(webData?.outputTokens),
    estimatedUsd:null,
    toolFeesIncluded:false
  }:webTrace?{status:webStatus,inputTokens:null,outputTokens:null,estimatedUsd:null,toolFeesIncluded:false}:null;

  let usd=0,priced=0,unpriced=0;
  const byRole=attempts.map(e=>{
    const inputTokens=tokenCount(e.inputTokens),outputTokens=tokenCount(e.outputTokens);
    const price=e.outcome==='success'?priceFor(e.model):null;
    // A posted unit price alone is insufficient unless BOTH usage fields are known.
    const priceKnown=Boolean(price&&inputTokens!==null&&outputTokens!==null);
    const estimatedUsd=priceKnown?(inputTokens*price.in+outputTokens*price.out)/1e6:null;
    if(priceKnown){usd+=estimatedUsd;priced++;}
    else unpriced++; // Failure could have been billed; never assert zero.
    return {
      role:String(e.stage||'unspecified'),provider:e.provider||null,
      model:e.model||null,outcome:e.outcome,
      inputTokens,outputTokens,
      estimatedUsd:estimatedUsd===null?null:Number(estimatedUsd.toFixed(6)),
      costKnown:priceKnown
    };
  });
  const tokenItems=[...byRole,...(webAttempted?[web]:[])];
  const input=totals(tokenItems,'inputTokens');
  const output=totals(tokenItems,'outputTokens');
  const totalKnown=input.known+output.known;
  const totalMissing=input.missing+output.missing;
  const untrackedCalls=Math.max(0,callsUsed-attempts.length-(webAttempted?1:0));
  // Web inference tokens and search tool calls have separate billable components.
  // Until a complete authoritative web price breakdown is available they stay unknown.
  const unknownCostCalls=unpriced+(webAttempted?1:0)+untrackedCalls;
  const estimateCoverage=priced&&!unknownCostCalls?'full':priced?'partial':'none';
  return {
    version:2,
    callsUsed,maxCalls:tokenCount(maxCalls),
    inputTokens:input.value,outputTokens:output.value,
    totalTokens:totalMissing?null:totalKnown,
    reportedInputTokens:input.known,reportedOutputTokens:output.known,
    reportedTotalTokens:totalKnown,
    tokenCoverage:tokenItems.length===0?'none':totalMissing===0?'full':totalMissing===tokenItems.length*2?'none':'partial',
    missingTokenFields:totalMissing,
    byRole,webSearch:web,
    estimatedUsd:priced?Number(usd.toFixed(6)):null,
    estimateCoverage,unknownCostCalls,pricedCalls:priced,untrackedCalls,
    estimateLabel:estimateCoverage==='full'?'estimated':estimateCoverage==='partial'?'known_subtotal':'unknown',
  };
}
