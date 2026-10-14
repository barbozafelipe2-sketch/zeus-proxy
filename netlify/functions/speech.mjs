import { requireUser } from './_shared/auth.mjs';
import { getRequestId, errorJson } from './_shared/http.mjs';
import { consumeEndpointRate } from './_shared/limits.mjs';

// ElevenLabs speech through OpenRouter, with server-side credentials only.
// Accepts OpenRouter preset voices or an ElevenLabs Voice ID (subject to BYOK rules).
const env=name=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';
const validVoice=id=>/^[A-Za-z0-9_-]{2,80}$/.test(String(id||''));
export default async function(req,context){
  const requestId=getRequestId(req,context,null);
  try{
    const auth=await requireUser(req,requestId);
    if(auth.error)return auth.error;
    if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
    const key=env('OPENROUTER_DIRECT_API_KEY')||env('OPENROUTER_API_KEY');
    if(!key)return errorJson('OpenRouter speech output is not configured.',501,'SPEECH_NOT_CONFIGURED',requestId);
    await consumeEndpointRate(auth.db,auth.user.id,'speech',requestId,30);
    let body;try{body=await req.json()}catch{return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId)}
    const text=String(body?.text||'').trim();
    if(!text||text.length>2500)return errorJson('Speech text must be between 1 and 2500 characters.',400,'INVALID_SPEECH_TEXT',requestId);
    const voiceId=String(body?.voiceId||env('OPENROUTER_SPEECH_VOICE')||'sarah').trim();
    if(!validVoice(voiceId))return errorJson('Choose an OpenRouter voice name or valid Voice ID.',400,'INVALID_VOICE_ID',requestId);
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),24000);
    const model=env('OPENROUTER_SPEECH_MODEL')||'elevenlabs/eleven-v4-turbo';
    let upstream;
    try{
      upstream=await fetch('https://openrouter.ai/api/v1/audio/speech',{
        method:'POST',signal:controller.signal,
        headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json','X-Title':'Zeus Proxy'},
        body:JSON.stringify({input:text,model,voice:voiceId,response_format:'mp3'})
      });
    }finally{clearTimeout(timeout)}
    if(!upstream.ok)return errorJson('OpenRouter could not generate speech for this voice.',502,'SPEECH_PROVIDER_FAILED',requestId);
    const length=Number(upstream.headers.get('content-length')||0);
    if(length>8*1024*1024)return errorJson('Speech file exceeds the allowed size.',413,'SPEECH_TOO_LARGE',requestId);
    const bytes=await upstream.arrayBuffer();
    if(bytes.byteLength>8*1024*1024)return errorJson('Speech file exceeds the allowed size.',413,'SPEECH_TOO_LARGE',requestId);
    return new Response(bytes,{status:200,headers:{'Content-Type':'audio/mpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){
    return errorJson(error?.code==='AI_RATE_LIMIT'?'Speech rate limit reached.':'Speech output is unavailable.',error?.status||503,error?.code||'SPEECH_FAILED',requestId);
  }
}
export const config={path:'/api/speech'};
