import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {configuredSpeechProviders,generateSpeech,listElevenLabsVoices,openRouterVoiceOptions,config} from '../netlify/functions/speech.mjs';

const previous=globalThis.Netlify;
const env={ELEVEN_LABS_API_KEY:'eleven-test-key',ELEVENLABS_VOICE_ID:'customVoice123',
  OPENAI_API_KEY:'gateway-test-key',OPENAI_BASE_URL:'https://gateway.example/openai/v1',
  GEMINI_API_KEY:'gemini-test-key',OPENROUTER_API_KEY:'openrouter-test-key'};
const fakeMp3=new Uint8Array([73,68,51,3,0,0,0,0]);
const ok=()=>new Response(fakeMp3,{headers:{'content-type':'audio/mpeg'}});
globalThis.Netlify={env:{get:key=>env[key]||''}};
try{
  assert.deepEqual(configuredSpeechProviders(),['elevenlabs','openai_gateway','gemini','openrouter']);
  assert.ok(config.path.includes('/api/speech/voices'));
  assert.ok(config.path.includes('/api/speech/openrouter/voices'));
  let request;
  const eleven=await generateSpeech('Olá Zeus!',{provider:'elevenlabs',fetchImpl:async(url,options)=>{
    request={url:String(url),options};return ok();
  }});
  assert.equal(eleven.route,'elevenlabs');
  assert.match(request.url,/text-to-speech\\/customVoice123/);
  assert.equal(request.options.headers['xi-api-key'],'eleven-test-key');
  assert.deepEqual(JSON.parse(request.options.body),{text:'Olá Zeus!',model_id:'eleven_multilingual_v2'});
  await assert.rejects(()=>generateSpeech('x',{elevenLabsVoiceId:'invalid voice'}),e=>e.status===400);
  const voiceList=await listElevenLabsVoices({fetchImpl:async()=>Response.json({voices:[{voice_id:'RachelVoice123',name:'Rachel',category:'premade'}]})});
  assert.equal(voiceList.voices[0].name,'Rachel');
  let gatewayRequest;
  const gateway=await generateSpeech('Test',{provider:'auto',fetchImpl:async(url,options)=>{
    if(String(url).includes('elevenlabs.io'))return new Response('unavailable',{status:503});
    gatewayRequest={url:String(url),options};return ok();
  }});
  assert.equal(gateway.route,'openai_gateway');
  assert.equal(gatewayRequest.url,'https://gateway.example/openai/v1/audio/speech');
  assert.equal(JSON.parse(gatewayRequest.options.body).model,'gpt-4o-mini-tts');
  let geminiRequest;
  const gemini=await generateSpeech('Test',{provider:'gemini',fetchImpl:async(url,options)=>{
    geminiRequest={url:String(url),options};
    return Response.json({candidates:[{content:{parts:[{inlineData:{data:Buffer.from([0,0,1,0]).toString('base64'),mimeType:'audio/pcm'}}]}}]});
  }});
  assert.equal(gemini.route,'gemini');
  assert.equal(gemini.contentType,'audio/wav');
  assert.equal(Buffer.from(gemini.bytes).toString('ascii',0,4),'RIFF');
  assert.match(geminiRequest.url,/generativelanguage\\.googleapis\\.com\\/v1beta\\/models\\/gemini-2\\.5-flash-preview-tts:generateContent/);
  assert.equal(geminiRequest.options.headers['x-goog-api-key'],'gemini-test-key');
  assert.equal(JSON.parse(geminiRequest.options.body).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,'Kore');
  assert.ok(openRouterVoiceOptions('google').voices.some(v=>v.id==='Kore'));
  assert.deepEqual(openRouterVoiceOptions('fish').voices,[]);
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/id="zeus-speech-provider"/);
  assert.match(app,/id="zeus-openrouter-model"/);
  assert.match(app,/id="zeus-openrouter-voice"/);
  assert.match(app,/id="elevenlabs-voice-preset"/);
  assert.match(app,/id="test-voice"/);
  assert.match(app,/openrouterModel:state\\.openrouterModel/);
  assert.ok(!app.includes('fallbackLiveSpeech'),'browser TTS must not silently mask backend errors');
  globalThis.Netlify={env:{get:()=>''}};
  assert.deepEqual(configuredSpeechProviders(),[]);
  await assert.rejects(()=>generateSpeech('Test'),e=>e.status===501&&e.code==='SPEECH_NOT_CONFIGURED');
  console.log('Speech routing and voice selector contracts: PASS');
}finally{
  if(previous===undefined)delete globalThis.Netlify;else globalThis.Netlify=previous;
}
