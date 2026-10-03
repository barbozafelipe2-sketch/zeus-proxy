type AnyError = {status?:unknown;statusCode?:unknown;code?:unknown;name?:unknown;message?:unknown;modelAttempts?:string[]};

function statusOf(error:unknown){
  const e=error as AnyError;
  const value=e?.status ?? e?.statusCode ?? e?.code;
  const n=Number(value);
  return Number.isFinite(n)?n:undefined;
}

export function resolveModelChain(primary:string|undefined,configuredChain:string|undefined,defaults:string[]){
  const explicit=configuredChain?.split(',').map(x=>x.trim()).filter(Boolean);
  if(explicit?.length)return [...new Set(explicit)].slice(0,5);
  const chain=[...(primary?.trim()?[primary.trim()]:[]),...defaults];
  return [...new Set(chain)].slice(0,5);
}

export function shouldTryNextModel(error:unknown){
  const e=error as AnyError;
  if(e?.name==='AbortError')return false;
  const status=statusOf(error);
  const message=String(e?.message||error||'').toLowerCase();
  if(status===401||status===403||status===429)return false;
  if(status===404||status===408||(status!==undefined&&status>=500))return true;
  if(message.includes('empty_provider_response'))return true;
  if(/\b(model|engine)\b/.test(message)&&/(not found|unsupported|unavailable|not available|does not exist|unknown)/.test(message))return true;
  return /(fetch failed|econnreset|etimedout|connection reset|socket hang up)/.test(message);
}

export async function runModelChain<T>(models:string[],signal:AbortSignal,call:(model:string)=>Promise<T>):Promise<{value:T;attempts:string[]}>{
  if(!models.length)throw new Error('MODEL_CHAIN_EMPTY');
  const attempts:string[]=[];
  let lastError:unknown;
  for(let i=0;i<models.length;i++){
    if(signal.aborted)throw new Error('MODEL_TIMEOUT');
    const model=models[i];
    attempts.push(model);
    try{
      return {value:await call(model),attempts};
    }catch(error){
      lastError=error;
      if(signal.aborted)throw new Error('MODEL_TIMEOUT');
      if(i===models.length-1||!shouldTryNextModel(error)){
        if(error&&typeof error==='object'){
          try{(error as AnyError).modelAttempts=[...attempts];}catch{}
        }
        throw error;
      }
    }
  }
  throw lastError instanceof Error?lastError:new Error('MODEL_CHAIN_EXHAUSTED');
}
