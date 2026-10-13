import { createHash } from 'node:crypto';

const env=(name)=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const configuredInt=(name,fallback,min,max)=>{
  const raw=Number(env(name));
  return Number.isFinite(raw)&&raw>0?Math.round(clamp(raw,min,max)):fallback;
};

export const TURBO_QUOTE_VERSION='turbo-budget-v1';

export function estimateTurboQuote({
  requirementCount=0,
  workstreamCount=0,
  hasFiles=false,
  artifactType=null,
  limits={maxCreators:3,maxCalls:10,timeoutMs:150000,maxPlanTokens:3200,maxCreatorTokens:7500,maxDirectorTokens:10000,maxCeoTokens:12000},
}={}){
  const maxCreators=clamp(limits?.maxCreators||3,1,6);
  const requirements=Math.max(0,Number(requirementCount)||0);
  const workstreams=Math.max(0,Number(workstreamCount)||0);
  const inferred=Math.max(1,workstreams,Math.ceil(requirements/2),artifactType?2:1,hasFiles?2:1);
  const creatorCount=Math.round(clamp(inferred,1,maxCreators));
  const expectedCalls=creatorCount+3;
  const hardCallCap=Math.round(clamp(limits?.maxCalls||10,expectedCalls,20));
  const timeoutSeconds=Math.ceil((Number(limits?.timeoutMs)||150000)/1000);
  const maxOutputTokens=(Number(limits?.maxPlanTokens)||3200)
    +creatorCount*(Number(limits?.maxCreatorTokens)||7500)
    +(Number(limits?.maxDirectorTokens)||10000)
    +(Number(limits?.maxCeoTokens)||12000);
  const approvalCallThreshold=configuredInt('OLYHUB_TURBO_APPROVAL_CALLS',6,4,hardCallCap);
  const approvalTokenThreshold=configuredInt('OLYHUB_TURBO_APPROVAL_OUTPUT_TOKENS',45000,16000,120000);
  return {
    version:TURBO_QUOTE_VERSION,
    level:'COMPLEX_TURBO',
    creatorCount,
    expectedCalls,
    hardCallCap,
    timeoutSeconds,
    maxOutputTokens,
    costBand:expectedCalls>=6?'high':expectedCalls===5?'elevated':'bounded',
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
