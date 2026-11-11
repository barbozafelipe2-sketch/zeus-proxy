import {executionLeaseExpired,validDispatchToken} from './worker-lease.mjs';

// Persist only supported request fields, never headers, cookies or credentials.
export function backgroundPayload(body,identity){
  const payload={};
  for(const key of ['imageOptions','toolId','compareAnswerToMessageId','comparePair','compareImageSourceId','compareType','liveTalk','olympusAuto','maxZeusLevel','turboApproval','resumeExecutionId'])
    if(body[key]!==undefined)payload[key]=body[key];
  return {...payload,...identity};
}
// Read-only recovery: exposes the same nonce only to the already authenticated
// owner lookup. A GET never queues, claims, restarts or invokes a provider.
export function backgroundRecovery(run,message,now=Date.now()){
  if(run.state!=='QUEUED'||executionLeaseExpired(run,now)||!validDispatchToken(run.dispatch_token))return null;
  const payload=message?.metadata?.backgroundPayload;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return null;
  return {dispatchRequired:true,dispatchToken:run.dispatch_token,dispatchPayload:payload};
}
