// User-facing chat errors must never include raw SQL, parameter lists, connection URLs or tokens.
const safeCodes=new Set([
  'AI_REQUEST_REJECTED','AI_NOT_CONFIGURED','AI_PROVIDER_AUTH','AI_PROVIDER_QUOTA',
  'AI_PROVIDER_RATE_LIMIT','AI_MODEL_UNAVAILABLE','AI_PROVIDERS_FAILED',
  'EXECUTION_BUDGET_EXHAUSTED','EXECUTION_DEADLINE','IMAGE_REQUIRED',
  'REQUEST_ID_REUSED','REQUEST_IN_PROGRESS','TURBO_APPROVAL_REQUIRED'
]);
// Actionable, secret-free messages for non-provider failures that previously collapsed into the generic text.
const authored={
  OLYMPUS_APPROVAL_REQUIRED:'This Olympus job has reached its authorized spend. Approve one additional $5, then retry the same request.',
  OLYMPUS_UNKNOWN_MODEL_PRICE:'A provider model has no verified price, so Olympus did not call it. Configure pricing or choose Zeus.',
  OLYMPUS_UNPRICED_ROUTE:'This Olympus media or web tool does not yet have a safe price reservation. Use Zeus for this request.',
  OLYMPUS_UNPRICED_MEDIA:'Image inputs in Olympus are paused until their cost can be reserved.',
  ARTIFACT_INCOMPLETE:'The requested files failed validation (incomplete, placeholder or missing file). Nothing partial was delivered. Retry, or ask for fewer files at once.',
  ARTIFACT_VERIFICATION_FAILED:'A generated file failed its integrity check, so it was not delivered. Please retry.',
  ARTIFACT_FORMAT_UNSUPPORTED:'This combination of file types is not supported (max 4 of PDF, DOCX, XLSX, PPTX, CSV).',
  ARTIFACT_TOO_LARGE:'The generated file exceeded the size limit. Ask for a shorter deliverable.',
  IMAGE_GENERATION_FAILED:'The selected image model rejected this combination of resolution, orientation or format. Retry with standard resolution and automatic orientation, or choose another image model.',
  IMAGE_RESOLUTION_UNAVAILABLE:'The selected resolution is unavailable on the active image route. Standard 1K can use the OpenAI fallback; 2K/4K needs an image model configured through Netlify AI Gateway or the OpenRouter fallback.',
  OLYMPUS_CREATOR_UNAVAILABLE:'No AI model was available for an Olympus specialist (provider credits, quota or configuration). Check provider credits or use Zeus mode.',
  OLYMPUS_CRITIC_UNAVAILABLE:'No AI model was available for the Olympus reviewer (provider credits, quota or configuration). Check provider credits or use Zeus mode.',
  PROVIDER_MODEL_INVALID_CACHED:'A configured model ID is invalid and was skipped. Check the model environment variables.',
  WORKER_LEASE_CONFLICT:'A previous Olympus worker no longer owns this execution. Its late response was discarded.',
  BACKGROUND_DISPATCH_FAILED:'Zeus Level 3 could not reach its Netlify background worker. The request remains queued; wait a few seconds and retry the same request to recover it.',
  AI_PROVIDER_QUOTA:'The AI provider or Netlify AI Gateway reports exhausted credits or quota. Check Netlify AI Gateway usage and the provider billing page, then retry.',
  AI_PROVIDER_AUTH:'The AI provider rejected its credentials. Check the Netlify AI Gateway or provider key configuration.',
  AI_PROVIDER_RATE_LIMIT:'The AI provider is temporarily rate-limiting requests. Wait a minute and retry.',
  AI_MODEL_UNAVAILABLE:'The selected AI model is unavailable. Retry later or check the configured model catalog.',
  AI_PROVIDERS_FAILED:'All configured AI providers failed this request. Check Netlify AI Gateway/provider status and available credits.',
  WEB_RESEARCH_UNAVAILABLE:'Current web research was requested but no verified live sources were retrieved. No up-to-date analysis was claimed. Check the AI Gateway web-search configuration or retry later.',
  COMPARE_FAMILIES_UNAVAILABLE:'Compare & Evolve needs two configured independent model families. No artifact was created.',
  COMPARE_FORMAT_UNSUPPORTED:'Independent A/B generation supports PDF, DOCX, XLSX, PPTX, CSV and HTML right now.',
  COMPARE_LIVE_RESEARCH_UNSUPPORTED:'Run live research first, then ask for an A/B pair using the saved sources.',
  AI_CONCURRENCY_LIMIT:'Another execution is still running. Wait for it to finish, then retry.',
  RATE_LIMIT:'Request safety limit reached. Try again later.',
  DATABASE_UNAVAILABLE:'Zeus workspace database is temporarily unavailable. Please retry shortly.'
};
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
  const message=authored[code]?authored[code]:safeCodes.has(code)
    ?(code==='AI_REQUEST_REJECTED'
       ?'The AI provider rejected the request. Check the input size or attachments before retrying.'
       :code==='REQUEST_IN_PROGRESS'
         ?'This request is already running.'
         :code==='EXECUTION_BUDGET_EXHAUSTED'||code==='EXECUTION_DEADLINE'
           ?'The execution time or AI call limit was reached (hard caps: Simple 1, Compound 2, Compound Plus 3, Turbo 4 calls; no extra retries). A model failed or was slow; retry, or use Zeus Simple.'
           :code==='IMAGE_REQUIRED'
             ?'Attach an image before asking to edit it.'
             :code==='AI_NOT_CONFIGURED'
               ?'No AI provider is configured for this request.'
               :'The AI provider could not complete this request. Please retry.')
    :'Zeus could not complete this request. Please retry or check the service status.';
  return {status:safeStatus,code,message,traceError:code};
}
