// User-facing chat errors must never include raw SQL, parameter lists, connection URLs or tokens.
const safeCodes=new Set([
  'AI_REQUEST_REJECTED','AI_NOT_CONFIGURED','AI_PROVIDER_AUTH','AI_PROVIDER_QUOTA',
  'AI_PROVIDER_RATE_LIMIT','AI_MODEL_UNAVAILABLE','AI_PROVIDERS_FAILED',
  'EXECUTION_BUDGET_EXHAUSTED','EXECUTION_DEADLINE','IMAGE_REQUIRED',
  'REQUEST_ID_REUSED','REQUEST_IN_PROGRESS','TURBO_APPROVAL_REQUIRED'
]);
const safeCategory=code=>/^[A-Z][A-Z0-9_]{1,63}$/.test(String(code||''))?String(code):null;
export function publicExecutionFailure(error){
  const raw=String(error?.message||error||'');
  const name=String(error?.name||'');
  const dbFailure=/failed query:|query failed:|\bparams:\s|invalid input value for enum|relation .* does not exist|column .* does not exist/i.test(raw)||
    /(?:DrizzleQueryError|DatabaseError|PostgresError)/i.test(name)||
    /^[0-9A-Z]{5}$/.test(String(error?.cause?.code||''));
  if(dbFailure){
    return {
      status:503,
      code:'DATABASE_QUERY_FAILED',
      message:'Zeus could not update its workspace database. The latest Netlify database migration may still be pending. Please retry after the deployment finishes.',
      traceError:'DATABASE_QUERY_FAILED'
    };
  }
  const status=Number(error?.status||0);
  const safeStatus=status>=400&&status<=599?status:503;
  const code=safeCategory(error?.code)||'AI_EXECUTION_FAILED';
  // Only specifically authored client messages can be sent to the browser.
  const message=safeCodes.has(code)
    ?(code==='AI_REQUEST_REJECTED'
       ?'The AI provider rejected the request. Check the input size or attachments before retrying.'
       :code==='REQUEST_IN_PROGRESS'
         ?'This request is already running.'
         :code==='EXECUTION_BUDGET_EXHAUSTED'||code==='EXECUTION_DEADLINE'
           ?'The execution time or call limit was reached. Please retry.'
           :code==='IMAGE_REQUIRED'
             ?'Attach an image before asking to edit it.'
             :code==='AI_NOT_CONFIGURED'
               ?'No AI provider is configured for this request.'
               :'The AI provider could not complete this request. Please retry.')
    :'Zeus could not complete this request. Please retry or check the service status.';
  return {status:safeStatus,code,message,traceError:code};
}
