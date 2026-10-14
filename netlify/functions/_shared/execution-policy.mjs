import { createHash } from 'node:crypto';

const env=(name)=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const configuredInt=(name,fallback,min,max)=>{
  const raw=Number(env(name));
  return Number.isFinite(raw)&&raw>0?Math.round(clamp(raw,min,max)):fallback;
};

export const TURBO_QUOTE_VERSION='turbo-budget-v2';
const TURBO_FIXED_ROLE_CALLS=2; // 1 manager (Director) + 1 CEO. No Planner call.
const TURBO_HARD_CAP=4; // 2 specialists + Director + CEO

// Deterministic (non-LLM) team sizing. The router only picks Turbo for multi-area
// work, so Turbo normally uses both specialists; never more than maxCreators (2).
export function turboCreatorCount({maxCreators=2}={}){
  return Math.max(1,Math.min(2,Math.round(Number(maxCreators)||2)));
}

export function estimateTurboQuote({
  requirementCount=0,
  workstreamCount=0,
  hasFiles=false,
  artifactType=null,
  limits={maxCreators:2,maxCalls:4,timeoutMs:150000,maxCreatorTokens:7500,maxDirectorTokens:10000,maxCeoTokens:12000},
}={}){
  const hardCallCap=Math.round(clamp(limits?.maxCalls||TURBO_HARD_CAP,TURBO_FIXED_ROLE_CALLS+1,TURBO_HARD_CAP));
  const maxCreators=Math.round(clamp(limits?.maxCreators||2,1,hardCallCap-TURBO_FIXED_ROLE_CALLS));
  const creatorCount=turboCreatorCount({maxCreators});
  const expectedCalls=creatorCount+TURBO_FIXED_ROLE_CALLS;
  const timeoutSeconds=Math.ceil((Number(limits?.timeoutMs)||150000)/1000);
  const maxOutputTokens=creatorCount*(Number(limits?.maxCreatorTokens)||7500)
    +(Number(limits?.maxDirectorTokens)||10000)
    +(Number(limits?.maxCeoTokens)||12000);
  const approvalCallThreshold=configuredInt('OLYHUB_TURBO_APPROVAL_CALLS',hardCallCap+1,3,hardCallCap+1);
  const approvalTokenThreshold=configuredInt('OLYHUB_TURBO_APPROVAL_OUTPUT_TOKENS',45000,16000,120000);
  return {
    version:TURBO_QUOTE_VERSION,
    level:'COMPLEX_TURBO',
    creatorCount,
    expectedCalls,
    hardCallCap,
    timeoutSeconds,
    maxOutputTokens,
    costBand:expectedCalls>=4?'elevated':'bounded',
    approvalRequired:expectedCalls>=approvalCallThreshold||maxOutputTokens>=approvalTokenThreshold,
    approvalThresholds:{calls:approvalCallThreshold,maxOutputTokens:approvalTokenThreshold},
    note:'Workload quote only; provider pricing varies and this is not a dollar estimate.',
  };
}

function normalizedIds(ids=[]){return [...new Set((Array.isArray(ids)?ids:[]).map(String).filter(Boolean))].sort();}

export function turboApprovalFingerprint({requestId='',content='',fileIds=[],quote={}}={}){
  const payload=JSON.stringify({
    version:TURBO_QUOTE_VERSION,
    requestId:String(requestId||''),
    content:String(content||''),
    fileIds:normalizedIds(fileIds),
    quote:{
      creatorCount:Number(quote.creatorCount||0),
      expectedCalls:Number(quote.expectedCalls||0),
      hardCallCap:Number(quote.hardCallCap||0),
      maxOutputTokens:Number(quote.maxOutputTokens||0),
    },
  });
  return createHash('sha256').update(payload).digest('hex');
}

const COMMIT=/\b(commit|push)\b.*\b(github|repo|repository|branch|codigo|c[oó]digo|repositorio|reposit[oó]rio)\b|\b(github|repo|repository|branch|repositorio|reposit[oó]rio)\b.*\b(commit|push)\b/i;
const DEPLOY=/\b(deploy|publish|release|go live|redeploy|publicar|publique|colocar no ar|subir producao|desplegar)\b/i;
const MERGE=/\b(merge|mergear|mesclar|fusionar)\b.*\b(main|branch|pr|pull request)\b/i;
const DESTRUCTIVE=/\b(delete|drop|destroy|wipe|remove production|deletar|apagar producao|excluir producao|borrar produccion|eliminar produccion)\b/i;

export function externalMutationPolicy(text=''){
  const value=String(text||''),requested=[];
  if(COMMIT.test(value))requested.push('github_commit');
  if(DEPLOY.test(value))requested.push('deploy');
  if(MERGE.test(value))requested.push('merge');
  if(DESTRUCTIVE.test(value))requested.push('destructive_change');
  return {
    requested:[...new Set(requested)],
    chatExecutionAllowed:false,
    rule:'External mutations require an explicit owner action in the dedicated action flow. Chat/Turbo may prepare artifacts but may not silently commit, deploy, merge, or delete production resources.',
  };
}
