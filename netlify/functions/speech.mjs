import { requireUser } from './_shared/auth.mjs';
import { getRequestId, errorJson } from './_shared/http.mjs';
import { consumeEndpointRate } from './_shared/limits.mjs';

const env=name=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';
const validId=id=>/^[A-Za-z0-9_-]{2,120}$/.test(String(id||''));
const OPENAI_VOICES=new Set(['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar']);
const MAX_AUDIO_BYTES=8*1024*1024;
const PROVIDER_TIMEOUT_MS=12000;

function speechRoutes(){
  const routes=[];
  const elevenKey=env('ELEVENLABS_API_KEY')||env('ELEVEN_LABS_API_KEY');
  const elevenVoice=env('ELEVENLABS_VOICE_ID')||env('ELEVEN_LABS_VOICE_ID');
  if(elevenKey&&validId(elevenVoice))routes.push({name:'elevenlabs',kind:'elevenlabs',key:elevenKey,voiceId:elevenVoice});

  const openaiKey=env('OPENAI_API_KEY');
  const openaiBase=env('OPENAI_BASE_URL')||env('OPENAI_API_BASE')||(openaiKey?'https://api.openai.com/v1':'');
  if(openaiKey&&openaiBase)routes.push({name:'openai_gateway',kind:'openai',key:openaiKey,base:openaiBase});

  const geminiKey=env('GEMINI_API_KEY');
  const geminiBase=env('GOOGLE_GEMINI_BASE_URL')||(geminiKey?'https://generativelanguage.googleapis.com':'');
  if(geminiKey&&geminiBase)routes.push({name:'gemini_gateway',kind:'gemini',key:geminiKey,base:geminiBase});
  return routes;
}

function appendPath(base,path){
  const url=new URL(String(base).replace(/\/$/,''));
  if(url.protocol!=='https:')throw new Error('Speech provider URL must use HTTPS.');
  return `${url.toString().replace(/\/$/,'')}${path}`;
}
function openaiSpeechUrl(base){
  const clean=String(base||'').replace(/\/$/,'');
  return appendPath(/\/v1$/.test(clean)?clean:`${clean}/v1`,'/audio/speech');
}
function geminiInteractionsUrl(base){
  const clean=String(base||'').replace(/\/$/,'');
  return appendPath(/\/v1beta$/.test(clean)?clean:`${clean}/v1beta`,'/interactions');
}
function openaiVoice(requested){
  const value=String(requested||'').trim().toLowerCase();
  return OPENAI_VOICES.has(value)?value:'marin';
}
function providerError(status){
  const error=new Error(`Speech provider returned ${status}.`);
  error.status=status;
  return error;
}
async function readAudioResponse(response){
  if(!response.ok)throw providerError(response.status);
  const claimed=Number(response.headers.get('content-length')||0);
  if(claimed>MAX_AUDIO_BYTES){const error=new Error('Speech response exceeds 8 MB.');error.status=413;throw error;}
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>MAX_AUDIO_BYTES){const error=new Error('Speech response exceeds 8 MB.');error.status=413;throw error;}
  if(!bytes.byteLength){const error=new Error('Speech provider returned empty audio.');error.status=502;throw error;}
  return {bytes,contentType:response.headers.get('content-type')||'audio/mpeg'};
}
async function callElevenLabs(route,text,signal,fetchImpl){
  const model=env('ELEVENLABS_MODEL_ID')||env('ELEVEN_LABS_MODEL_ID')||'eleven_multilingual_v2';
  const url=new URL(appendPath('https://api.elevenlabs.io',`/v1/text-to-speech/${encodeURIComponent(route.voiceId)}`));
  url.searchParams.set('output_format','mp3_44100_128');
  const response=await fetchImpl(url,{method:'POST',signal,headers:{'xi-api-key':route.key,'Content-Type':'application/json','Accept':'audio/mpeg'},body:JSON.stringify({text,model_id:model})});
  return readAudioResponse(response);
}
async function callOpenAI(route,text,voice,signal,fetchImpl){
  const response=await fetchImpl(openaiSpeechUrl(route.base),{
    method:'POST',signal,headers:{Authorization:`Bearer ${route.key}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:env('OPENAI_SPEECH_MODEL')||'gpt-4o-mini-tts',input:text,voice:openaiVoice(voice),instructions:'Speak naturally and warmly in the same language as the text. Use clear, conversational pacing and natural intonation.',response_format:'mp3'})
  });
  return readAudioResponse(response);
}
async function callGemini(route,text,signal,fetchImpl){
  const model=env('GEMINI_SPEECH_MODEL')||'gemini-3.8-flash-tts';
  const response=await fetchImpl(geminiInteractionsUrl(route.base),{
    method:'POST',signal,headers:{'x-goog-api-key':route.key,'Content-Type':'application/json'},
    body:JSON.stringify({
      model,
      input:[{type:'user_input',content:[{type:'text',text,annotations:[{type:'speech_metadata',style:'Natural, warm, conversational Brazilian Portuguese when the input is Portuguese. Use clear articulation and relaxed pacing.'}]}]}],
      response_format:{type:'audio'},
      generation_config:{speech_config:[{voice:env('GEMINI_SPEECH_VOICE')||'Kore'}]}
    })
  });
  if(!response.ok)throw providerError(response.status);
  const data=await response.json().catch(()=>({}));
  const encoded=String(data?.output_audio?.data||'');
  if(!encoded)throw providerError(response.status||502);
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.byteLength>MAX_AUDIO_BYTES){const error=new Error('Speech response exceeds 8 MB.');error.status=413;throw error;}
  if(!bytes.byteLength)throw providerError(502);
  return {bytes,contentType:'audio/wav'};
}

export function configuredSpeechProviders(){return speechRoutes().map(({name})=>name);}

export async function generateSpeech(text,{voice='marin',fetchImpl=globalThis.fetch,onProviderError=()=>{}}={}){
  const routes=speechRoutes();
  let lastStatus=0;
  for(const route of routes){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),PROVIDER_TIMEOUT_MS);
    try{
      const result=route.kind==='elevenlabs'
        ?await callElevenLabs(route,text,controller.signal,fetchImpl)
        :route.kind==='openai'
          ?await callOpenAI(route,text,voice,controller.signal,fetchImpl)
          :await callGemini(route,text,controller.signal,fetchImpl);
      return {...result,route:route.name};
    }catch(error){
      lastStatus=error?.name==='AbortError'?504:Number(error?.status)||503;
      onProviderError(route.name,lastStatus);
      if(lastStatus===413)throw error;
    }finally{clearTimeout(timeout);}
  }
  const error=new Error(routes.length?'Speech generation failed on all configured voice providers.':'No server speech provider is configured.');
  error.status=routes.length?(lastStatus===429?429:502):501;
  error.code=routes.length?'SPEECH_PROVIDER_FAILED':'SPEECH_NOT_CONFIGURED';
  throw error;
}

export default async function(req,context){
  const requestId=getRequestId(req,context,null);
  try{
    const auth=await requireUser(req,requestId);
    if(auth.error)return auth.error;
    if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
    let body;try{body=await req.json()}catch{return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);}
    const text=String(body?.text||'').trim();
    if(!text||text.length>2500)return errorJson('Speech text must be 1 to 2500 characters.',400,'INVALID_SPEECH_TEXT',requestId);
    if(!speechRoutes().length)return errorJson('Configure ElevenLabs or enable OpenAI/Gemini speech through Netlify AI Gateway.',501,'SPEECH_NOT_CONFIGURED',requestId);
    await consumeEndpointRate(auth.db,auth.user.id,'speech',requestId,30);
    const audio=await generateSpeech(text,{voice:body?.voiceId,onProviderError:(provider,status)=>console.warn('Speech provider failed',requestId,provider,status)});
    return new Response(audio.bytes,{status:200,headers:{'Content-Type':audio.contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Zeus-Voice-Route':audio.route}});
  }catch(error){
    const status=error?.code==='AI_RATE_LIMIT'?429:error?.status||503;
    const code=error?.code||'SPEECH_FAILED';
    const message=error?.code==='AI_RATE_LIMIT'?'Speech rate limit reached.':'Zeus replied in chat, but speech audio is unavailable. Check the server voice configuration and try again.';
    return errorJson(message,status,code,requestId);
  }
}
export const config={path:'/api/speech'};
