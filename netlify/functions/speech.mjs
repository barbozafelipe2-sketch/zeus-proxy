import { requireUser } from './_shared/auth.mjs';
import { getRequestId, errorJson } from './_shared/http.mjs';
import { consumeEndpointRate } from './_shared/limits.mjs';

const env=name=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';
const validId=id=>/^[A-Za-z0-9_-]{2,120}$/.test(String(id||''));
const OPENAI_VOICES=new Set(['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar']);
const MAX_AUDIO_BYTES=8*1024*1024;
const PROVIDER_TIMEOUT_MS=30000;
const DEFAULT_ELEVENLABS_VOICE_ID='EXAVITQu4vr4xnSDxMaL'; // Sarah (premade)
const RETRYABLE_VOICE_STATUSES=new Set([401,404,422]);

function speechRoutes({elevenLabsVoiceId=''}={}){
  const routes=[];
  const elevenKey=env('ELEVENLABS_API_KEY')||env('ELEVEN_LABS_API_KEY');
  const envVoice=[env('ELEVENLABS_VOICE_ID'),env('ELEVEN_LABS_VOICE_ID')].map(v=>String(v||'').trim()).find(validId)||'';
  const fallbackVoice=envVoice||DEFAULT_ELEVENLABS_VOICE_ID;
  const requested=String(elevenLabsVoiceId||'').trim();
  const elevenVoice=validId(requested)?requested:fallbackVoice;
  if(elevenKey)routes.push({name:'elevenlabs',kind:'elevenlabs',key:elevenKey,voiceId:elevenVoice,fallbackVoiceId:elevenVoice!==fallbackVoice?fallbackVoice:''});

  const openaiKey=env('OPENAI_API_KEY');
  const openaiBase=env('OPENAI_BASE_URL');
  // Explicit gateway URL required; do not silently call the vendor directly.
  if(openaiKey&&openaiBase)routes.push({name:'openai_gateway',kind:'openai',key:openaiKey,base:openaiBase});

  const geminiKey=env('GEMINI_API_KEY');
  const geminiBase=env('GOOGLE_GEMINI_BASE_URL');
  if(geminiKey&&geminiBase)routes.push({name:'gemini',kind:'gemini',key:geminiKey,base:geminiBase});
  const openrouterKey=env('OPENROUTER_API_KEY');
  if(openrouterKey)routes.push({name:'openrouter',kind:'openrouter',key:openrouterKey});
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
function providerError(status,detail=''){
  const error=new Error(`Speech provider returned ${status}.`);
  error.status=status;
  if(detail)error.detail=detail;
  return error;
}
function safeDetail(value,secrets=[]){
  let text=String(value||'').replace(/\s+/g,' ').trim();
  for(const secret of secrets)if(secret&&secret.length>=6)text=text.split(secret).join('[redacted]');
  return text.replace(/xi-api-key\S*/gi,'[redacted]').replace(/\bBearer\s+[^\s"']+/gi,'Bearer [redacted]').replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g,'[redacted]').replace(/\bAIza[A-Za-z0-9_-]{18,}\b/g,'[redacted]').slice(0,200);
}
async function elevenLabsErrorDetail(response,key){
  try{
    const raw=await response.text();
    let parsed=null;try{parsed=JSON.parse(raw)}catch{}
    const d=parsed?.detail;
    const text=d&&typeof d==='object'
      ?[d.status,d.message].filter(Boolean).join(': ')
      :typeof d==='string'?d:Array.isArray(d)?d.map(item=>item?.msg||'').filter(Boolean).join('; '):(parsed?.message||raw);
    return safeDetail(text,[key]);
  }catch{return '';}
}
async function readAudioResponse(response){
  if(!response.ok)throw providerError(response.status,await response.text().then(v=>safeDetail(v)).catch(() => ''));
  const claimed=Number(response.headers.get('content-length')||0);
  if(claimed>MAX_AUDIO_BYTES){const error=new Error('Speech response exceeds 8 MB.');error.status=413;throw error;}
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>MAX_AUDIO_BYTES){const error=new Error('Speech response exceeds 8 MB.');error.status=413;throw error;}
  if(!bytes.byteLength){const error=new Error('Speech provider returned empty audio.');error.status=502;throw error;}
  return {bytes,contentType:response.headers.get('content-type')||'audio/mpeg'};
}
async function callElevenLabs(route,text,signal,fetchImpl,voiceId=route.voiceId){
  const model=env('ELEVENLABS_MODEL_ID')||env('ELEVEN_LABS_MODEL_ID')||'eleven_multilingual_v2';
  const url=new URL(appendPath('https://api.elevenlabs.io',`/v1/text-to-speech/${encodeURIComponent(voiceId)}`));
  url.searchParams.set('output_format','mp3_44100_128');
  const response=await fetchImpl(url,{method:'POST',signal,headers:{'xi-api-key':route.key,'Content-Type':'application/json','Accept':'audio/mpeg'},body:JSON.stringify({text,model_id:model})});
  if(!response.ok)throw providerError(response.status,await elevenLabsErrorDetail(response,route.key));
  return readAudioResponse(response);
}
async function callOpenAI(route,text,voice,signal,fetchImpl){
  const response=await fetchImpl(openaiSpeechUrl(route.base),{
    method:'POST',signal,headers:{Authorization:`Bearer ${route.key}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:env('OPENAI_SPEECH_MODEL')||'gpt-4o-mini-tts',input:text,voice:openaiVoice(voice),instructions:'Speak calmly and naturally in the same language as the text. Use relaxed, conversational pacing and restrained warmth. Avoid exaggerated excitement, praise, or theatrical emphasis.',response_format:'mp3'})
  });
  return readAudioResponse(response);
}
function pcmToWav(pcm,sampleRate=24000){
  const header=Buffer.alloc(44);header.write('RIFF',0);header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(sampleRate,24);header.writeUInt32LE(sampleRate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);return Buffer.concat([header,pcm]);
}
async function callGemini(route,text,signal,fetchImpl,googleVoice='Kore'){
  const model=env('GEMINI_SPEECH_MODEL')||'gemini-2.5-flash-preview-tts';
  if(!/^[a-zA-Z0-9._-]+$/.test(model))throw providerError(400);
  const base=String(route.base).replace(/\/$/,'');
  const apiBase=/\/v1beta$/.test(base)?base:base+'/v1beta';
  const response=await fetchImpl(appendPath(apiBase,'/models/'+encodeURIComponent(model)+':generateContent'),{
    method:'POST',signal,headers:{'x-goog-api-key':route.key,'Content-Type':'application/json'},
    body:JSON.stringify({contents:[{parts:[{text}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:googleVoice||env('GEMINI_SPEECH_VOICE')||'Kore'}}}}})
  });
  if(!response.ok){const detail=await response.text().catch(()=> '');throw providerError(response.status,safeDetail(detail,[route.key]));}
  const data=await response.json().catch(()=>({}));
  const audio=data?.candidates?.[0]?.content?.parts?.find(p=>p?.inlineData?.data)?.inlineData;
  if(!audio?.data)throw providerError(502);
  const pcm=Buffer.from(audio.data,'base64');
  const bytes=/audio\/wav/i.test(audio.mimeType||'')?pcm:pcmToWav(pcm);
  if(!bytes.length||bytes.length>MAX_AUDIO_BYTES)throw providerError(bytes.length?413:502);
  return {bytes,contentType:'audio/wav'};
}


const OPENROUTER_TTS_MODELS=Object.freeze({google:'google/gemini-3.8-flash-tts',fish:'fish-audio/s2.1-pro'});
const OPENROUTER_GOOGLE_VOICES=Object.freeze(['Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe','Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi','Laomedeia','Achernar','Alnilam','Schedar','Gacrux','Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat']);
export function openRouterVoiceOptions(model='google'){
  if(!Object.hasOwn(OPENROUTER_TTS_MODELS,model))throw Object.assign(new Error('Invalid OpenRouter model.'),{status:400,code:'INVALID_TTS_MODEL'});
  return {model,modelId:OPENROUTER_TTS_MODELS[model],voices:model==='google'?OPENROUTER_GOOGLE_VOICES.map(name=>({id:name,name})):[],voiceSource:model==='google'?'google-prebuilt':'provider-dependent',customVoiceSupported:false};
}
async function discoverOpenRouterVoiceOptions(model,{fetchImpl=globalThis.fetch}={}){
  const configured=openRouterVoiceOptions(model);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),5000);
  try{
    const response=await fetchImpl('https://openrouter.ai/api/v1/models?output_modalities=speech',{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!response.ok)throw providerError(502,'OpenRouter model catalog unavailable.');
    const payload=await response.json();
    const found=(Array.isArray(payload?.data)?payload.data:[]).find(item=>item?.id===configured.modelId);
    if(!found)return {...configured,available:false,voices:[],voiceSource:'openrouter-live-catalog',reason:'Model not listed in OpenRouter speech catalog'};
    const supported=Array.isArray(found.supported_voices)?found.supported_voices:[];
    const voices=supported.map(v=>typeof v==='string'?{id:v,name:v}:v&&typeof v==='object'?{id:String(v.id||v.name||''),name:String(v.name||v.id||'')}:null)
      .filter(v=>v&&/^[A-Za-z0-9_:-]{2,120}$/.test(v.id)).slice(0,150);
    return {...configured,available:true,voices,voiceSource:'openrouter-live-catalog',customVoiceSupported:false};
  }finally{clearTimeout(timeout);}
}
function audioFromProvider(responseBytes,contentType){
  const bytes=Buffer.from(responseBytes);
  const mime=String(contentType||'').split(';')[0].toLowerCase();
  const isWav=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE';
  const isMp3=bytes.toString('ascii',0,3)==='ID3'||(bytes.length>2&&bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0);
  const isOgg=bytes.toString('ascii',0,4)==='OggS';
  const isFlac=bytes.toString('ascii',0,4)==='fLaC';
  if(isWav)return {bytes,contentType:'audio/wav'};
  if(isMp3)return {bytes,contentType:'audio/mpeg'};
  if(isOgg)return {bytes,contentType:'audio/ogg'};
  if(isFlac)return {bytes,contentType:'audio/flac'};
  if(mime==='audio/pcm'||mime==='audio/l16'){
    if(bytes.length%2)throw providerError(502,'Invalid PCM sample alignment.');
    const wav=pcmToWav(bytes);
    if(wav.length>MAX_AUDIO_BYTES)throw providerError(413);
    return {bytes:wav,contentType:'audio/wav'};
  }
  throw providerError(502,'Unsupported or unrecognized audio format.');
}
async function callOpenRouterTts(route,text,model,voice,signal,fetchImpl){
  const options=openRouterVoiceOptions(model);
  const chosen=String(voice||'').trim();
  if(chosen&&!/^[A-Za-z0-9_-]{2,80}$/.test(chosen))throw Object.assign(new Error('Invalid voice.'),{status:400,code:'INVALID_TTS_VOICE'});
  if(model==='google'&&chosen&&!options.voices.some(v=>v.id===chosen))throw Object.assign(new Error('Unsupported Google voice.'),{status:400,code:'INVALID_TTS_VOICE'});
  const response=await fetchImpl('https://openrouter.ai/api/v1/audio/speech',{
    method:'POST',signal,headers:{Authorization:'Bearer '+route.key,'Content-Type':'application/json','Accept':'audio/mpeg, audio/wav, audio/pcm'},
    body:JSON.stringify({model:options.modelId,input:text,...(model==='google'?{voice:chosen||'Kore'}:chosen?{voice:chosen}:{}),response_format:'mp3'})
  });
  if(!response.ok)throw providerError(response.status);
  const audio=await readAudioResponse(response);
  return audioFromProvider(audio.bytes,audio.contentType);
}

export function configuredSpeechProviders({elevenLabsVoiceId=''}={}){return speechRoutes({elevenLabsVoiceId}).map(({name})=>name);}

export async function listElevenLabsVoices({search='',nextPageToken='',fetchImpl=globalThis.fetch}={}){
  const key=env('ELEVENLABS_API_KEY')||env('ELEVEN_LABS_API_KEY');
  if(!key){const error=new Error('ElevenLabs API key is not configured.');error.status=501;error.code='ELEVENLABS_NOT_CONFIGURED';throw error;}
  const pageToken=String(nextPageToken||'').trim();
  if(pageToken.length>512){const error=new Error('Invalid ElevenLabs page token.');error.status=400;error.code='INVALID_VOICE_PAGE_TOKEN';throw error;}
  const url=new URL('https://api.elevenlabs.io/v2/voices');
  url.searchParams.set('page_size','100');url.searchParams.set('include_total_count','false');url.searchParams.set('sort','name');url.searchParams.set('sort_direction','asc');
  const query=String(search||'').trim().slice(0,100);if(query)url.searchParams.set('search',query);
  if(pageToken)url.searchParams.set('next_page_token',pageToken);
  const response=await fetchImpl(url,{method:'GET',headers:{'xi-api-key':key,'Accept':'application/json'}});
  if(!response.ok)throw providerError(response.status);
  const payload=await response.json().catch(()=>({}));
  const voices=(Array.isArray(payload?.voices)?payload.voices:[]).filter(v=>validId(v?.voice_id)&&typeof v?.name==='string').map(v=>({
    voice_id:String(v.voice_id),name:String(v.name).slice(0,120),category:String(v.category||'').slice(0,40),
    labels:Object.fromEntries(Object.entries(v.labels||{}).filter(([key,value])=>['language','accent','gender','age','use_case'].includes(key)&&typeof value==='string').map(([key,value])=>[key,value.slice(0,60)])),
    preview_url:/^https:\/\//i.test(String(v.preview_url||''))?String(v.preview_url).slice(0,1000):''
  }));
  return {voices,hasMore:Boolean(payload?.has_more),nextPageToken:String(payload?.next_page_token||'').slice(0,512)};
}

async function attempt(route,call){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),PROVIDER_TIMEOUT_MS);
  try{return await call(controller.signal);}finally{clearTimeout(timeout);}
}
const failureEntry=(provider,error,extra={})=>({provider,status:error?.name==='AbortError'?504:Number(error?.status)||503,...(error?.detail?{detail:String(error.detail).slice(0,200)}:{}),...extra});

export async function generateSpeech(text,{voice='marin',elevenLabsVoiceId='',provider='auto',openrouterModel='google',openrouterVoice='',googleVoice='',fetchImpl=globalThis.fetch,onProviderError=()=>{}}={}){
  if(elevenLabsVoiceId&&!validId(elevenLabsVoiceId)){const error=new Error('Invalid ElevenLabs Voice ID.');error.status=400;error.code='INVALID_ELEVENLABS_VOICE_ID';throw error;}
  if(!['auto','gemini','elevenlabs','openai','openrouter'].includes(provider))throw Object.assign(new Error('Invalid speech provider.'),{status:400,code:'INVALID_SPEECH_PROVIDER'});
  if(provider==='openrouter'){
    openRouterVoiceOptions(openrouterModel);
    const chosen=String(openrouterVoice||'').trim();
    if(chosen&&!/^[A-Za-z0-9_-]{2,80}$/.test(chosen))throw Object.assign(new Error('Invalid voice.'),{status:400,code:'INVALID_TTS_VOICE'});
    if(openrouterModel==='google'&&chosen&&!OPENROUTER_GOOGLE_VOICES.includes(chosen))throw Object.assign(new Error('Unsupported Google voice.'),{status:400,code:'INVALID_TTS_VOICE'});
  }
  if(googleVoice&&!OPENROUTER_GOOGLE_VOICES.includes(googleVoice))throw Object.assign(new Error('Invalid Google voice.'),{status:400,code:'INVALID_GOOGLE_VOICE'});
  const routes=speechRoutes({elevenLabsVoiceId}).filter(r=>provider==='auto'||r.kind===provider);
  const providerFailures=[];
  let lastStatus=0;
  const record=entry=>{lastStatus=entry.status;providerFailures.push(entry);onProviderError(entry.provider,entry.status,entry.detail||'');return entry;};
  for(const route of routes){
    if(route.kind==='elevenlabs'){
      try{
        const result=await attempt(route,signal=>callElevenLabs(route,text,signal,fetchImpl));
        return {...result,route:route.name,voiceId:route.voiceId,voiceFallback:false};
      }catch(error){
        const entry=record(failureEntry(route.name,error,{voice:route.fallbackVoiceId?'selected':'default'}));
        if(entry.status===413)throw error;
        if(route.fallbackVoiceId&&RETRYABLE_VOICE_STATUSES.has(entry.status)){
          // The browser-selected voice was rejected: retry once with the server default voice.
          try{
            const result=await attempt(route,signal=>callElevenLabs(route,text,signal,fetchImpl,route.fallbackVoiceId));
            return {...result,route:route.name,voiceId:route.fallbackVoiceId,voiceFallback:true};
          }catch(retryError){record(failureEntry(route.name,retryError,{voice:'default'}));}
        }
      }
      continue;
    }
    try{
      const result=await attempt(route,signal=>route.kind==='openrouter'?callOpenRouterTts(route,text,openrouterModel,openrouterVoice,signal,fetchImpl):route.kind==='openai'
        ?callOpenAI(route,text,voice,signal,fetchImpl)
        :callGemini(route,text,signal,fetchImpl,googleVoice));
      return {...result,route:route.name,voiceFallback:false};
    }catch(error){
      const entry=record(failureEntry(route.name,error));
      if(entry.status===413)throw error;
      if(route.kind==='gemini'&&googleVoice&&googleVoice!=='Kore'&&![401,403,429].includes(entry.status)){
        try{
          const fallback=await attempt(route,signal=>callGemini(route,text,signal,fetchImpl,'Kore'));
          return {...fallback,route:route.name,voiceFallback:true,voiceId:'Kore'};
        }catch(retryError){record(failureEntry(route.name,retryError,{voice:'Kore fallback'}));}
      }
    }
  }
  const primary=providerFailures.find(f=>f.provider==='elevenlabs');
  const error=new Error(routes.length?'Speech generation failed on all configured voice providers.':'No server speech provider is configured.');
  error.status=routes.length?(lastStatus===429?429:502):501;
  error.code=routes.length?'SPEECH_PROVIDER_FAILED':'SPEECH_NOT_CONFIGURED';
  error.providerFailures=providerFailures;
  if(primary)error.elevenLabs={status:primary.status,detail:primary.detail||''};
  throw error;
}

export default async function(req,context){
  const requestId=getRequestId(req,context,null);
  try{
    const auth=await requireUser(req,requestId);
    if(auth.error)return auth.error;
    const url=new URL(req.url);
    if(url.pathname==='/api/speech/openrouter/voices'){
      if(req.method!=='GET')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
      await consumeEndpointRate(auth.db,auth.user.id,'speech-voices',requestId,20);
      const model=url.searchParams.get('model')||'google';
      if(!Object.hasOwn(OPENROUTER_TTS_MODELS,model))return errorJson('Invalid OpenRouter model.',400,'INVALID_TTS_MODEL',requestId);
      try{return Response.json(await discoverOpenRouterVoiceOptions(model),{headers:{'Cache-Control':'no-store'}})}
      catch{return errorJson('OpenRouter voice catalog is unavailable.',502,'OPENROUTER_CATALOG_UNAVAILABLE',requestId)}
    }
    if(url.pathname==='/api/speech/voices'){
      if(req.method!=='GET')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
      try{
        await consumeEndpointRate(auth.db,auth.user.id,'speech-voices',requestId,20);
        const voices=await listElevenLabsVoices({search:url.searchParams.get('search')||'',nextPageToken:url.searchParams.get('nextPageToken')||''});
        return Response.json(voices,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      }catch(error){
        const status=Number(error?.status)||502;
        console.warn('ElevenLabs voice list failed',requestId,status);
        const message=status===501?'Configure ELEVENLABS_API_KEY in Netlify to list voices.':status===429?'ElevenLabs rate limited voice listing. Try again shortly.':status===401||status===403?'ElevenLabs rejected the API key or it lacks permission to list voices.':'Could not load ElevenLabs voices. Check the API key and try again.';
        return errorJson(message,status===429?429:status===501?501:status===400?400:502,'ELEVENLABS_VOICE_LIST_FAILED',requestId);
      }
    }
    if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
    let body;try{body=await req.json()}catch{return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);}
    const text=String(body?.text||'').trim();
    if(!text||text.length>2500)return errorJson('Speech text must be 1 to 2500 characters.',400,'INVALID_SPEECH_TEXT',requestId);
    const elevenLabsVoiceId=String(body?.elevenLabsVoiceId||'').trim();
    const provider=String(body?.provider||'auto').toLowerCase();
    if(!['auto','gemini','elevenlabs','openai','openrouter'].includes(provider))return errorJson('Invalid speech provider.',400,'INVALID_SPEECH_PROVIDER',requestId);
    if(provider==='openrouter'){
      if(!['google','fish'].includes(String(body?.openrouterModel||'google')))return errorJson('Invalid OpenRouter TTS model.',400,'INVALID_TTS_MODEL',requestId);
      const chosen=String(body?.openrouterVoice||'').trim();
      if(chosen&&!/^[A-Za-z0-9_-]{2,80}$/.test(chosen))return errorJson('Invalid voice selection.',400,'INVALID_TTS_VOICE',requestId);
      if((body?.openrouterModel||'google')==='google'&&chosen&&!OPENROUTER_GOOGLE_VOICES.includes(chosen))return errorJson('Unsupported Google voice.',400,'INVALID_TTS_VOICE',requestId);
    }
    if(!speechRoutes({elevenLabsVoiceId}).some(r=>provider==='auto'||r.kind===provider))return errorJson('Selected speech provider is not configured.',501,'SPEECH_NOT_CONFIGURED',requestId);
    await consumeEndpointRate(auth.db,auth.user.id,'speech',requestId,30);
    const audio=await generateSpeech(text,{voice:body?.voiceId,elevenLabsVoiceId,provider,openrouterModel:body?.openrouterModel,openrouterVoice:body?.openrouterVoice,googleVoice:body?.googleVoice,onProviderError:(provider,status,detail)=>console.error('Speech provider failed',requestId,provider,status,detail||'')});
    return new Response(audio.bytes,{status:200,headers:{'Content-Type':audio.contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Zeus-Voice-Route':audio.route,...(audio.voiceFallback?{'X-Zeus-Voice-Fallback':'1'}:{}),...(audio.voiceId?{'X-Zeus-Voice-Used':audio.voiceId}:{})}});
  }catch(error){
    const status=error?.status||503;
    const code=error?.code||'SPEECH_FAILED';
    const message=error?.code==='INVALID_ELEVENLABS_VOICE_ID'?'The ElevenLabs Voice ID is invalid. Check it in Voice settings and try again.':(error?.elevenLabs?`ElevenLabs ${error.elevenLabs.status}${error.elevenLabs.detail?`: ${error.elevenLabs.detail}`:''}`:error?.providerFailures?.some(f=>f.provider==='openai_gateway')?('OpenAI speech failed. '+(error.providerFailures.some(f=>f.status===429)?'OpenAI quota or rate limit reached.':'Check OpenAI API billing and configuration.')):error?.providerFailures?.some(f=>f.provider==='gemini')?('Google speech could not generate audio. '+(error.providerFailures.some(f=>f.status===429)?'Google rate limit reached; try again shortly.':'Try another voice or retry with a shorter passage.')):'Zeus replied in chat, but speech audio is unavailable. Check the server voice configuration and try again.');
    return errorJson(message,status,code,requestId,{providerFailures:Array.isArray(error?.providerFailures)?error.providerFailures:[],...(error?.elevenLabs?{elevenLabs:error.elevenLabs}:{})});
  }
}
export const config={path:['/api/speech','/api/speech/voices','/api/speech/openrouter/voices']};
