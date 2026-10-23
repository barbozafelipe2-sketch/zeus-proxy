import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {configuredSpeechProviders,generateSpeech} from '../netlify/functions/speech.mjs';

const previousNetlify=globalThis.Netlify;
const env={
  ELEVEN_LABS_API_KEY:'eleven-test-key',ELEVENLABS_VOICE_ID:'customVoice123',
  OPENAI_API_KEY:'netlify-openai-key',OPENAI_BASE_URL:'https://gateway.example/openai/v1',
  GEMINI_API_KEY:'netlify-gemini-key',GOOGLE_GEMINI_BASE_URL:'https://gateway.example/google',
};
globalThis.Netlify={env:{get:key=>env[key]||''}};
const audio=new Uint8Array([1,2,3,4]);
const okAudio=()=>new Response(audio,{status:200,headers:{'content-type':'audio/mpeg'}});

try{
  assert.deepEqual(configuredSpeechProviders(),['elevenlabs','openai_gateway','gemini_gateway']);
  let seen=null;
  const primary=await generateSpeech('Olá Zeus!',{fetchImpl:async(url,options)=>{seen={url:String(url),options};return okAudio();}});
  assert.equal(primary.route,'elevenlabs','ElevenLabs custom voice is the primary route');
  assert.match(seen.url,/api\.elevenlabs\.io\/v1\/text-to-speech\/customVoice123\?output_format=mp3_44100_128/);
  assert.equal(seen.options.headers['xi-api-key'],'eleven-test-key');
  assert.deepEqual(JSON.parse(seen.options.body),{text:'Olá Zeus!',model_id:'eleven_multilingual_v2'});

  const urls=[];
  const openai=await generateSpeech('Olá, como posso ajudar?',{voice:'cedar',fetchImpl:async(url,options)=>{
    urls.push(String(url));
    if(urls.length===1)return new Response(JSON.stringify({error:'upstream'}),{status:502});
    assert.equal(options.headers.Authorization,'Bearer netlify-openai-key');
    const payload=JSON.parse(options.body);
    assert.equal(payload.model,'gpt-4o-mini-tts');
    assert.equal(payload.voice,'cedar');
    assert.match(payload.instructions,/same language as the text/);
    return okAudio();
  }});
  assert.equal(openai.route,'openai_gateway','OpenAI is used when ElevenLabs fails');
  assert.equal(urls.length,2);
  assert.equal(urls[1],'https://gateway.example/openai/v1/audio/speech');

  let geminiRequest=null;
  const gemini=await generateSpeech('Resposta de teste.',{fetchImpl:async(url,options)=>{
    const target=String(url);
    if(target.includes('/text-to-speech/'))return new Response('unavailable',{status:503});
    if(target.endsWith('/audio/speech'))return new Response('unavailable',{status:503});
    geminiRequest={url:target,options};
    return Response.json({output_audio:{data:Buffer.from([82,73,70,70]).toString('base64')}});
  }});
  assert.equal(gemini.route,'gemini_gateway','Gemini is the last configured fallback');
  assert.equal(gemini.contentType,'audio/wav');
  assert.equal(geminiRequest.url,'https://gateway.example/google/v1beta/interactions');
  assert.equal(geminiRequest.options.headers['x-goog-api-key'],'netlify-gemini-key');
  const geminiBody=JSON.parse(geminiRequest.options.body);
  assert.equal(geminiBody.model,'gemini-3.8-flash-tts');
  assert.equal(geminiBody.generation_config.speech_config[0].voice,'Kore');
  assert.equal(geminiBody.input[0].content[0].text,'Resposta de teste.');

  globalThis.Netlify={env:{get:()=>''}};
  assert.deepEqual(configuredSpeechProviders(),[]);
  await assert.rejects(()=>generateSpeech('Sem configuração'),error=>error.status===501&&error.code==='SPEECH_NOT_CONFIGURED');

  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.ok(!app.includes('fallbackLiveSpeech'),'browser speech synthesis cannot silently mask TTS failures');
  const play=app.slice(app.indexOf('async function sayZeusReply('),app.indexOf('function stopLiveCapture('));
  assert.match(play,/if\(!res\.ok\)throw/);
  assert.match(play,/natural voice audio is unavailable/);
  console.log('ElevenLabs → OpenAI Gateway → Gemini TTS routing and visible failure handling: PASS');
}finally{
  if(previousNetlify===undefined)delete globalThis.Netlify;else globalThis.Netlify=previousNetlify;
}
