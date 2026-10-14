import { requireUser } from './_shared/auth.mjs';
import { getRequestId, errorJson } from './_shared/http.mjs';
import { consumeEndpointRate } from './_shared/limits.mjs';

// Netlify AI Gateway FIRST, direct OpenRouter key only as fallback.
// Neither key is sent to the browser. Unsupported Gateway speech models
// (for example, where ZDR is unavailable) may recover via direct OpenRouter.
const env=name=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';
const validVoice=id=>/^[A-Za-z0-9_-]{2,80}$/.test(String(id||''));
const directBase=()=>env('OPENROUTER_DIRECT_BASE_URL')||'https://openrouter.ai/api/v1';
function routes(){
  const gatewayKey=env('OPENROUTER_API_KEY'),gatewayBase=env('OPENROUTER_BASE_URL');
  const directKey=env('OPENROUTER_DIRECT_API_KEY');
  const items=[];
  // Gateway keys are scoped to the injected base URL. NEVER forward those
  // credentials to the public openrouter.ai URL.
  if(gatewayKey&&gatewayBase)items.push({name:'gateway',key:gatewayKey,base:gatewayBase});
  if(directKey)items.push({name:'openrouter_direct',key:directKey,base:directBase()});
  return items;
}
function endpoint(base){
  const u=new URL(String(base).replace(/\/$/,'')+'/audio/speech');
  if(u.protocol!=='https:')throw new Error('Invalid OpenRouter speech URL');
  return u.toString();
}
function shouldFallback(status){return [401,402,403,404,408,409,429].includes(status)||status>=500;}
export default async function(req,context){
  const requestId=getRequestId(req,context,null);
  try{
    const auth=await requireUser(req,requestId);
    if(auth.error)return auth.error;
    if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
    const available=routes();
    if(!available.length)return errorJson('Configure the Netlify OpenRouter gateway or the direct fallback key.',501,'SPEECH_NOT_CONFIGURED',requestId);
    await consumeEndpointRate(auth.db,auth.user.id,'speech',requestId,30);
    let body;try{body=await req.json()}catch{return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);}
    const text=String(body?.text||'').trim();
    if(!text||text.length>2500)return errorJson('Speech text must be 1 to 2500 characters.',400,'INVALID_SPEECH_TEXT',requestId);
    const voice=String(body?.voiceId||env('OPENROUTER_SPEECH_VOICE')||'sarah').trim();
    if(!validVoice(voice))return errorJson('Choose a supported preset or valid Voice ID.',400,'INVALID_VOICE_ID',requestId);
    const model=env('OPENROUTER_SPEECH_MODEL')||'elevenlabs/eleven-v4-turbo';
    const payload=JSON.stringify({input:text,model,voice,response_format:'mp3'});
    let lastStatus=0;
    for(const route of available){
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),18000);
      try{
        const response=await fetch(endpoint(route.base),{
          method:'POST',signal:controller.signal,
          headers:{Authorization:`Bearer ${route.key}`,'Content-Type':'application/json','X-Title':'Zeus Proxy'},
          body:payload
        });
        lastStatus=response.status;
        if(response.ok){
          const claimed=Number(response.headers.get('content-length')||0);
          if(claimed>8*1024*1024)return errorJson('Speech exceeds 8 MB.',413,'SPEECH_TOO_LARGE',requestId);
          const bytes=await response.arrayBuffer();
          if(bytes.byteLength>8*1024*1024)return errorJson('Speech exceeds 8 MB.',413,'SPEECH_TOO_LARGE',requestId);
          if(!bytes.byteLength)return errorJson('Speech provider returned empty audio.',502,'SPEECH_EMPTY',requestId);
          return new Response(bytes,{status:200,headers:{'Content-Type':'audio/mpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Zeus-Voice-Route':route.name}});
        }
        // Invalid model parameters or voice selections won't be fixed by
        // moving the same invalid request to a different transport.
        if(!shouldFallback(response.status))break;
      }catch(error){
        // Network errors and timeouts can recover via the next transport.
        lastStatus=error?.name==='AbortError'?504:503;
      }finally{clearTimeout(timeout);}
    }
    return errorJson('Speech generation failed on available OpenRouter routes.',lastStatus===429?429:502,'SPEECH_PROVIDER_FAILED',requestId);
  }catch(error){
    return errorJson(error?.code==='AI_RATE_LIMIT'?'Speech rate limit reached.':'Speech output is unavailable.',error?.status||503,error?.code||'SPEECH_FAILED',requestId);
  }
}
export const config={path:'/api/speech'};
