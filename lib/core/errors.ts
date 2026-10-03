export function errorCode(e:unknown){
  const any=e as any;
  const raw=e instanceof Error?e.message:String(e||'MODEL_FAILED');
  const lower=raw.toLowerCase();
  const status=Number(any?.status||any?.statusCode||any?.code);
  if(raw==='MODEL_TIMEOUT'||any?.name==='AbortError')return 'MODEL_TIMEOUT';
  if(raw.includes('NOT_CONFIGURED'))return raw;
  if(raw==='EMPTY_PROVIDER_RESPONSE')return raw;
  if(status===401||lower.includes('invalid api key')||lower.includes('authentication'))return 'PROVIDER_AUTH_FAILED';
  if(status===403)return 'PROVIDER_FORBIDDEN';
  if(status===404||(lower.includes('model')&&/(not found|unsupported|unavailable|not available|does not exist|unknown)/.test(lower)))return 'PROVIDER_MODEL_UNAVAILABLE';
  if(status===429||lower.includes('rate limit'))return 'PROVIDER_RATE_LIMITED';
  if(status===400||status===422)return 'PROVIDER_BAD_REQUEST';
  if(status>=500||/(fetch failed|econnreset|etimedout|connection reset|socket hang up)/.test(lower))return 'PROVIDER_UNAVAILABLE';
  return 'MODEL_FAILED';
}
export function httpStatus(code:string){
  if(code==='INVALID_REQUEST')return 400;
  if(code==='REQUEST_IN_PROGRESS')return 409;
  if(code==='PROVIDER_RATE_LIMITED')return 429;
  if(code.includes('NOT_CONFIGURED')||code==='PROVIDER_UNAVAILABLE'||code==='PROVIDER_MODEL_UNAVAILABLE')return 503;
  if(code==='MODEL_TIMEOUT')return 504;
  if(code==='PROVIDER_AUTH_FAILED'||code==='PROVIDER_BAD_REQUEST'||code==='PROVIDER_FORBIDDEN'||code==='EMPTY_PROVIDER_RESPONSE')return 502;
  return 502;
}
