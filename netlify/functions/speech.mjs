import { requireUser } from './_shared/auth.mjs';
import { json, getRequestId, errorJson } from './_shared/http.mjs';
import { consumeEndpointRate } from './_shared/limits.mjs';

// Optional ElevenLabs integration: the API key is server-only. Browser clients
// submit a public voice ID, never credentials.
const env=name=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';
const validVoice=id=>/^[A-Za-z0-9_-]{8,80}$/.test(String(id||''));
export default async function(req,context){
  const requestId=getRequestId(req,context,null);
  try{
    const auth=await requireUser(req,requestId);
    if(auth.error)return auth.error;
    if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
    const key=env('ELEVENLABS_API_KEY');
    if(!key)return errorJson('ElevenLabs speech output is not configured.',501,'SPEECH_NOT_CONFIGURED',requestId);
    await consumeEndpointRate(auth.db,auth.user.id,'speech',requestId,30);
    let body;try{body=await req.json()}catch{return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId)}
    const text=String(body?.text||'').trim();
    if(!text||text.length>2500)return errorJson('Speech text must be between 1 and 2500 characters.',400,'INVALID_SPEECH_TEXT',requestId);
    const voiceId=String(body?.voiceId||env('ELEVENLABS_VOICE_ID')||'').trim();
    if(!validVoice(voiceId))return errorJson('Choose a valid ElevenLabs Voice ID in Settings.',400,'INVALID_VOICE_ID',requestId);
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),24000);
    let upstream;
    try{
      upstream=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voiceId)+'?output_format=mp3_44100_128',{
        method:'POST',signal:controller.signal,
        headers:{'xi-api-key':key,'Content-Type':'application/json'},
        body:JSON.stringify({text,model_id:env('ELEVENLABS_TTS_MODEL')||'eleven_multilingual_v2'})
      });
    }finally{clearTimeout(timeout)}
    if(!upstream.ok)return errorJson('ElevenLabs could not generate speech for this voice.',502,'SPEECH_PROVIDER_FAILED',requestId);
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
